import type { Page } from "patchright";

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

export class Pacer {
  private lastActionAt = 0;

  constructor(
    private readonly sleep: Sleep = realSleep,
    private readonly rng: Rng = Math.random,
    private readonly now: () => number = Date.now,
  ) {}

  /** Wait so consecutive actions are spaced by a log-normal gap. The first action is not delayed. */
  async betweenActions(): Promise<number> {
    if (this.lastActionAt === 0) {
      this.lastActionAt = this.now();
      return 0;
    }
    const gap = logNormalDelay(this.rng);
    const elapsed = this.now() - this.lastActionAt;
    const wait = Math.max(0, gap - elapsed);
    if (wait > 0) await this.sleep(wait);
    this.lastActionAt = this.now();
    return wait;
  }

  async afterNavigation(): Promise<number> {
    const ms = Math.round(uniform(this.rng, NAV_PAUSE.minMs, NAV_PAUSE.maxMs));
    await this.sleep(ms);
    return ms;
  }

  /** A short beat between UI steps inside one action (open menu, then click item). */
  async beat(minMs = 400, maxMs = 1200): Promise<void> {
    await this.sleep(Math.round(uniform(this.rng, minMs, maxMs)));
  }

  async typeText(page: Page, text: string, opts: { newline?: "enter" | "shift-enter" } = {}): Promise<void> {
    const newlineKey = opts.newline === "shift-enter" ? "Shift+Enter" : "Enter";
    if ([...text].length <= PER_CHAR_TYPING_MAX) {
      const chars = [...text];
      const delays = keystrokeDelays(text, this.rng);
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]!;
        if (ch === "\n") await page.keyboard.press(newlineKey);
        else if (ch !== "\r") await page.keyboard.type(ch);
        await this.sleep(delays[i]!);
      }
      return;
    }
    const lines = text.replace(/\r/g, "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i]) await page.keyboard.insertText(lines[i]!);
      if (i < lines.length - 1) await page.keyboard.press(newlineKey);
      await this.sleep(Math.round(uniform(this.rng, 150, 700)));
    }
  }

  /** Smooth scrolling in a few uneven steps, pausing to "read". */
  async scroll(page: Page, steps = 3): Promise<void> {
    for (let i = 0; i < steps; i++) {
      const total = Math.round(uniform(this.rng, 450, 900));
      const parts = 4 + Math.floor(this.rng() * 4);
      for (let p = 0; p < parts; p++) {
        await page.mouse.wheel(0, Math.round(total / parts));
        await this.sleep(Math.round(uniform(this.rng, 30, 90)));
      }
      await this.sleep(Math.round(uniform(this.rng, 700, 1800)));
    }
  }
}
