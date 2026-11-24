import { LinkedInMcpError } from "../errors.js";
import { readJson, writeJsonAtomic, withFileLock } from "../state/store.js";
import { type Clock, formatLocal, systemClock } from "../util/time.js";

export type PageVerdict = "ok" | "checkpoint" | "captcha" | "unusual_activity" | "restricted" | "login_wall";

export interface PageSignals {
  url: string;
  title?: string;
  /** Visible text of the page, or the first few KB of it. */
  text?: string;
  /**
   * Whether the signed-in LinkedIn navigation bar is present. Challenge and
   * sign-in pages never render it. When known, body-text rules only run when
   * it is absent, so a feed post that mentions "captcha" can't trip the guard.
   */
  hasGlobalNav?: boolean;
}

const URL_RULES: [RegExp, PageVerdict][] = [
  [/\/checkpoint\/challenge/i, "captcha"],
  [/\/checkpoint\/(lg\/)?(login-submit|rp|pk)/i, "checkpoint"],
  [/\/checkpoint\//i, "checkpoint"],
  [/\/(authwall|uas\/login|login|signup)(\/|\?|$)/i, "login_wall"],
  [/\/(m\/)?restricted/i, "restricted"],
];

const TEXT_RULES: [RegExp, PageVerdict][] = [
  [/let'?s do a quick security check|verify you'?re (a )?human|i'?m not a robot|complete the (security )?challenge|captcha/i, "captcha"],
  [/unusual activity|suspicious activity|we noticed some unusual/i, "unusual_activity"],
  [/account (has been |is )?(temporarily )?restricted|your account has been (temporarily )?(limited|suspended)|we'?ve restricted your account/i, "restricted"],
  [/quick security verification|enter the (verification )?code we sent|confirm it'?s you/i, "checkpoint"],
];

const LOGIN_WALL_TEXT = /^(sign in|join linkedin|join now|welcome back)\b/im;

/** Pure: decides whether a page is a challenge, restriction or login wall. */
export function classifyPage(signals: PageSignals): PageVerdict {
  let path = signals.url;
  try {
    const u = new URL(signals.url);
    if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return "ok";
    path = u.pathname + u.search;
  } catch {
    // keep the raw string
  }
  for (const [re, verdict] of URL_RULES) if (re.test(path)) return verdict;

  const title = signals.title ?? "";
  const text = signals.text ?? "";
  const signedIn =
    signals.hasGlobalNav ?? /\b(my network|messaging|notifications)\b/i.test(text.slice(0, 6000));

  // With the signed-in app around it, only trust the page title: body text may
  // be someone's post that happens to mention these words.
  const haystack = signedIn ? title : `${title}\n${text.slice(0, 4000)}`;
  for (const [re, verdict] of TEXT_RULES) if (re.test(haystack)) return verdict;

  if (!signedIn && (LOGIN_WALL_TEXT.test(title) || /sign in to (view|see|continue)|join to view|join linkedin/i.test(haystack))) {
    return "login_wall";
  }
  return "ok";
}

export interface BreakerState {
  open: boolean;
  reason: PageVerdict | "manual" | null;
  tripped_at: string | null;
  /** null while open means "until resume". */
  until: string | null;
  url: string | null;
  note: string | null;
}

const CLOSED: BreakerState = { open: false, reason: null, tripped_at: null, until: null, url: null, note: null };
export const AUTO_TRIP_MS = 24 * 60 * 60_000;

const REASON_TEXT: Record<Exclude<BreakerState["reason"], null>, string> = {
  checkpoint: "LinkedIn asked for a security verification",
  captcha: "LinkedIn showed a CAPTCHA or human check",
  unusual_activity: "LinkedIn reported unusual activity",
  restricted: "LinkedIn shows the account as restricted",
  login_wall: "LinkedIn signed the automation browser out",
  ok: "",
  manual: "Automation was paused by you",
};

/**
 * Circuit breaker persisted to disk. When open, every tool refuses until it
 * expires (24 h for automatic trips) or the user resumes.
 */
export class CircuitBreaker {
  constructor(
    private readonly file: string,
    private readonly clock: Clock = systemClock,
  ) {}

  async state(): Promise<BreakerState> {
    const state = { ...CLOSED, ...(await readJson<BreakerState>(this.file, CLOSED)) };
    if (state.open && state.until && new Date(state.until).getTime() <= this.clock().getTime()) {
      return { ...CLOSED };
    }
    return state;
  }

  async assertClosed(): Promise<void> {
    const state = await this.state();
    if (!state.open) return;
    const reason = state.reason ? REASON_TEXT[state.reason] : "Automation is paused";
    const when = state.until ? `It reopens automatically at ${formatLocal(new Date(state.until))}.` : "It stays paused until you resume it.";
    throw new LinkedInMcpError(
      "CIRCUIT_OPEN",
      `All LinkedIn actions are paused: ${reason}. ${when}`,
      state.reason === "manual"
        ? "Call the resume tool when you want to continue."
        : state.reason === "login_wall"
          ? "Run `npx @danishfareed/linkedin-mcp login`, sign in, and the pause clears itself."
          : "Run `npx @danishfareed/linkedin-mcp login` to open a visible window, resolve the check on LinkedIn yourself, then call the resume tool. Do not retry automatically.",
      { ...state },
    );
  }

  async trip(reason: Exclude<BreakerState["reason"], null | "ok">, opts: { url?: string; durationMs?: number | null; note?: string } = {}): Promise<BreakerState> {
    const now = this.clock();
    const duration = opts.durationMs === undefined ? (reason === "manual" ? null : AUTO_TRIP_MS) : opts.durationMs;
    const next: BreakerState = {
      open: true,
      reason,
      tripped_at: now.toISOString(),
      until: duration === null ? null : new Date(now.getTime() + duration).toISOString(),
      url: opts.url ?? null,
      note: opts.note ?? null,
    };
    await withFileLock(this.file, () => writeJsonAtomic(this.file, next));
    return next;
  }

  async reset(): Promise<BreakerState> {
    await withFileLock(this.file, () => writeJsonAtomic(this.file, CLOSED));
    return { ...CLOSED };
  }

  /** After a successful sign-in, clear a pause that was caused by a login wall. */
  async clearIfLoginWall(): Promise<boolean> {
    const state = await this.state();
    if (state.open && state.reason === "login_wall") {
      await this.reset();
      return true;
    }
    return false;
  }
}

export function checkpointError(verdict: Exclude<PageVerdict, "ok">, url: string): LinkedInMcpError {
  if (verdict === "login_wall") {
    return new LinkedInMcpError(
      "NOT_LOGGED_IN",
      "LinkedIn showed a sign-in page, so the session has ended. Automation is paused.",
      "Run `npx @danishfareed/linkedin-mcp login`, sign in, then try again.",
      { url },
    );
  }
  return new LinkedInMcpError(
    "CHECKPOINT",
    `${REASON_TEXT[verdict]}. All automation is paused for 24 hours to protect your account.`,
    "Do not retry. Run `npx @danishfareed/linkedin-mcp login` to open a visible window, resolve the check on LinkedIn yourself, then call the resume tool.",
    { verdict, url },
  );
}
