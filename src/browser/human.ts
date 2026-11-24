import type { Page } from "patchright";
import { type Deadline, deadlineExceeded } from "./deadline.js";

/**
 * Pacing primitives. This is about volume and rhythm (one person, one action
 * at a time, at human speed), not about disguising the browser.
 */

export type Rng = () => number;
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/** Standard normal via Box-Muller. */
export function gaussian(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function uniform(rng: Rng, min: number, max: number): number {
  return min + (max - min) * rng();
}

export interface DelayShape {
  medianMs: number;
  sigma: number;
  minMs: number;
  maxMs: number;
}

/** Between actions: log-normal, median about 4 s, clamped to 1.5–20 s. */
export const ACTION_DELAY: DelayShape = { medianMs: 4000, sigma: 0.55, minMs: 1500, maxMs: 20_000 };

/** After each navigation: 1–4 s. */
export const NAV_PAUSE = { minMs: 1000, maxMs: 4000 };

export function logNormalDelay(rng: Rng, shape: DelayShape = ACTION_DELAY): number {
  const raw = shape.medianMs * Math.exp(shape.sigma * gaussian(rng));
  return Math.round(Math.min(shape.maxMs, Math.max(shape.minMs, raw)));
}

/** Text longer than this is entered paragraph by paragraph, the way people paste a drafted post. */
export const PER_CHAR_TYPING_MAX = 600;

/** Per-keystroke delays for a string: 35–140 ms with an occasional thinking pause. */
export function keystrokeDelays(text: string, rng: Rng): number[] {
  const delays: number[] = [];
  let sincePause = 0;
  let nextPauseAt = 18 + Math.floor(rng() * 30);
  for (const ch of text) {
    let d = uniform(rng, 35, 140);
    if (ch === " " || ch === "\n") d += uniform(rng, 0, 60);
    if (/[.,!?;:]/.test(ch)) d += uniform(rng, 40, 180);
    sincePause++;
    if (sincePause >= nextPauseAt) {
      d += uniform(rng, 300, 900);
      sincePause = 0;
      nextPauseAt = 18 + Math.floor(rng() * 30);
    }
    delays.push(Math.round(d));
  }
  return delays;
}

/** Rough cost of one keyboard call on top of its planned delay. */
const KEY_OVERHEAD_MS = 12;

/**
 * Time kept free after typing for the rest of an action (finding and clicking
 * the button, checking the result) when deciding how to enter text.
 */
export const TYPING_RESERVE_MS = 15_000;

/** Estimated time to type text key by key with the given per-key delays. */
export function estimateKeyTypingMs(delays: readonly number[]): number {
  return delays.reduce((sum, d) => sum + d, 0) + delays.length * KEY_OVERHEAD_MS;
}

/**
 * Key by key only for text up to PER_CHAR_TYPING_MAX characters whose
 * estimated typing time still leaves TYPING_RESERVE_MS of the call's budget.
 * Otherwise the text is inserted paragraph by paragraph.
 */
export function shouldTypeKeyByKey(charCount: number, estimateMs: number, remainingMs: number): boolean {
  if (charCount > PER_CHAR_TYPING_MAX) return false;
  return estimateMs + TYPING_RESERVE_MS <= remainingMs;
}

/**
 * One Pacer per process keeps the rhythm between actions. Each tool call gets
 * a view bound to its Deadline (`withDeadline`) that shares that rhythm.
 */
export class Pacer {
  private state = { lastActionAt: 0 };
  private deadline: Deadline | null = null;

  constructor(
    private readonly sleep: Sleep = realSleep,
    private readonly rng: Rng = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /** A view of this pacer whose waits respect `deadline`. It shares the action rhythm. */
  withDeadline(deadline: Deadline): Pacer {
    const view = new Pacer(this.sleep, this.rng, this.now);
    view.state = this.state;
    view.deadline = deadline;
    return view;
  }

  private remainingMs(): number {
    return this.deadline ? this.deadline.remainingMs() : Number.POSITIVE_INFINITY;
  }

  private async sleepWithinBudget(ms: number): Promise<void> {
    await this.sleep(this.deadline ? this.deadline.clamp(ms) : ms);
  }

  /**
   * Wait so consecutive actions are spaced by a log-normal gap. The first
   * action is not delayed. The gap is never shortened: if it doesn't fit in
   * the call's budget, this throws TIMEOUT instead of waiting.
   */
  async betweenActions(): Promise<number> {
    this.deadline?.check("pacing");
    if (this.state.lastActionAt === 0) {
      this.state.lastActionAt = this.now();
      return 0;
    }
    const gap = logNormalDelay(this.rng);
    const elapsed = this.now() - this.state.lastActionAt;
    const wait = Math.max(0, gap - elapsed);
    if (this.deadline && wait >= this.deadline.remainingMs()) throw deadlineExceeded("pacing", this.deadline.budgetMs);
    if (wait > 0) await this.sleep(wait);
    this.state.lastActionAt = this.now();
    return wait;
  }

  async afterNavigation(): Promise<number> {
    this.deadline?.check("navigation");
    const ms = Math.round(uniform(this.rng, NAV_PAUSE.minMs, NAV_PAUSE.maxMs));
    await this.sleepWithinBudget(ms);
    return ms;
  }

  /**
   * A short beat between UI steps inside one action (open menu, then click
   * item). It never throws: beats also follow the click that sends something,
   * and a TIMEOUT there would report a sent action as failed. Once the budget
   * is used up it just stops waiting.
   */
  async beat(minMs = 400, maxMs = 1200): Promise<void> {
    await this.sleepWithinBudget(Math.round(uniform(this.rng, minMs, maxMs)));
  }

  /**
   * Types short text key by key at a human pace. Long text, or text that
   * wouldn't finish comfortably within the call's budget, is inserted
   * paragraph by paragraph, the way people paste a drafted post.
   */
  async typeText(page: Page, text: string, opts: { newline?: "enter" | "shift-enter" } = {}): Promise<void> {
    this.deadline?.check("typing");
    const newlineKey = opts.newline === "shift-enter" ? "Shift+Enter" : "Enter";
    const chars = [...text];
    const delays = chars.length <= PER_CHAR_TYPING_MAX ? keystrokeDelays(text, this.rng) : [];
    if (shouldTypeKeyByKey(chars.length, estimateKeyTypingMs(delays), this.remainingMs())) {
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]!;
        if (ch === "\n") await page.keyboard.press(newlineKey);
        else if (ch !== "\r") await page.keyboard.type(ch);
        await this.sleep(delays[i]!);
      }
      return;
    }
    const lines = text.replace(/\r/g, "").split("\n");
    // Spread the pauses so every line goes in before the budget runs out.
    const pauseCap = this.deadline ? Math.max(30, Math.floor((this.remainingMs() - TYPING_RESERVE_MS) / lines.length)) : Number.POSITIVE_INFINITY;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.insertText(lines[i]!);
      if (i < lines.length - 1) await page.keyboard.press(newlineKey);
      await this.sleep(Math.min(pauseCap, Math.round(uniform(this.rng, 150, 700))));
    }
  }

  /** Smooth scrolling in a few uneven steps, pausing to "read". */
  async scroll(page: Page, steps = 3): Promise<void> {
    for (let i = 0; i < steps; i++) {
      this.deadline?.check("scroll");
      const total = Math.round(uniform(this.rng, 450, 900));
      const parts = 4 + Math.floor(this.rng() * 4);
      for (let p = 0; p < parts; p++) {
        await page.mouse.wheel(0, Math.round(total / parts));
        await this.sleepWithinBudget(Math.round(uniform(this.rng, 30, 90)));
      }
      await this.sleepWithinBudget(Math.round(uniform(this.rng, 700, 1800)));
    }
  }
}
