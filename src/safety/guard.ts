import { LinkedInMcpError } from "../errors.js";
import { readJson, writeJsonAtomic, withFileLock } from "../state/store.js";
import { type Clock, formatLocal, systemClock } from "../util/time.js";

/**
 * - `offsite`: the tab ended up on another site (a Wi-Fi sign-in page, a proxy
 *   or ISP page). A network problem, not something LinkedIn did.
 * - everything else except `ok` trips the circuit breaker.
 */
export type PageVerdict = "ok" | "offsite" | "checkpoint" | "captcha" | "unusual_activity" | "restricted" | "login_wall";

/** Verdicts that pause automation. */
export type TripVerdict = Exclude<PageVerdict, "ok" | "offsite">;

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
  /**
   * Whether LinkedIn's "Welcome back" account picker (`#rememberme-div`) is on
   * the page. It keeps the requested URL, so only the element gives it away,
   * and it looks the same in every language.
   */
  rememberMe?: boolean;
}

export function isLinkedInHost(hostname: string): boolean {
  return /(^|\.)linkedin\.com$/i.test(hostname);
}

/** True for http(s) URLs on linkedin.com or a subdomain. */
export function isLinkedInUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && isLinkedInHost(u.hostname);
  } catch {
    return false;
  }
}

/** LinkedIn's page for restricted accounts. It sits under /login/, so it must be checked before the sign-in rules. */
const RESTRICTION_URL = /\/login-restriction(\/|\?|#|$)|\/(m\/)?restricted(\/|\?|#|$)/i;

export function isRestrictionUrl(url: string): boolean {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // keep the raw string
  }
  return RESTRICTION_URL.test(path);
}

const URL_RULES: [RegExp, PageVerdict][] = [
  [RESTRICTION_URL, "restricted"],
  [/\/checkpoint\/challenge/i, "captcha"],
  [/\/checkpoint\/(lg\/)?(login-submit|rp|pk)/i, "checkpoint"],
  [/\/checkpoint\//i, "checkpoint"],
  [/\/(authwall|uas\/login|login|signup)(\/|\?|$)/i, "login_wall"],
];

const TEXT_RULES: [RegExp, PageVerdict][] = [
  [/let'?s do a quick security check|verify you'?re (a )?human|i'?m not a robot|complete the (security )?challenge|captcha/i, "captcha"],
  [/unusual activity|suspicious activity|we noticed some unusual/i, "unusual_activity"],
  [/account (has been |is )?(temporarily )?restricted|your account has been (temporarily )?(limited|suspended)|we'?ve restricted your account/i, "restricted"],
  [/quick security verification|enter the (verification )?code we sent|confirm it'?s you/i, "checkpoint"],
];

const LOGIN_WALL_TEXT = /^(sign in|join linkedin|join now|welcome back)\b/im;

/** Pure: decides whether a page is off LinkedIn, a challenge, a restriction or a login wall. */
export function classifyPage(signals: PageSignals): PageVerdict {
  let path = signals.url;
  try {
    const u = new URL(signals.url);
    // Chrome's own error page means the load failed; any other site means
    // something between us and LinkedIn answered instead.
    if (u.protocol === "chrome-error:") return "offsite";
    if ((u.protocol === "https:" || u.protocol === "http:") && !isLinkedInHost(u.hostname)) return "offsite";
    path = u.pathname + u.search;
  } catch {
    // keep the raw string
  }
  for (const [re, verdict] of URL_RULES) if (re.test(path)) return verdict;

  // The account picker shows on any URL once the session has expired.
  if (signals.rememberMe) return "login_wall";

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

// --- Rate limiting -----------------------------------------------------------

/** Cooldown when LinkedIn throttles without saying for how long. */
export const RATE_LIMIT_COOLDOWN_S = 4 * 3600;
const MIN_COOLDOWN_S = 60;
const MAX_COOLDOWN_S = 24 * 3600;

/** LinkedIn answers 999 ("request denied") when it throttles; 429 is the standard status. */
export function isThrottleStatus(status: number): boolean {
  return status === 429 || status === 999;
}

/**
 * Seconds to wait, from a Retry-After header (delta-seconds or an HTTP date).
 * Missing or unreadable headers give the default cooldown. The result is kept
 * between one minute and a day.
 */
export function retryAfterSeconds(header: string | null | undefined, now: Date): number {
  let seconds: number | null = null;
  const value = header?.trim();
  if (value) {
    if (/^\d+$/.test(value)) seconds = Number(value);
    else {
      const at = Date.parse(value);
      if (Number.isFinite(at)) seconds = Math.ceil((at - now.getTime()) / 1000);
    }
  }
  if (seconds === null) return RATE_LIMIT_COOLDOWN_S;
  return Math.min(MAX_COOLDOWN_S, Math.max(MIN_COOLDOWN_S, seconds));
}

export interface ThrottleHit {
  /** HTTP status, or null for a redirect loop. */
  status: number | null;
  url: string;
  retryAfterSeconds: number;
}

/**
 * Pure: whether a main-frame document response means LinkedIn is throttling.
 * Responses from other hosts (a captive portal, say) never count.
 */
export function throttleFromResponse(r: { status: number; url: string; retryAfter?: string | null }, now: Date): ThrottleHit | null {
  if (!isThrottleStatus(r.status) || !isLinkedInUrl(r.url)) return null;
  return { status: r.status, url: r.url, retryAfterSeconds: retryAfterSeconds(r.retryAfter, now) };
}

/** Navigation errors that mean throttling: LinkedIn has shown it as an endless redirect. */
export function isRedirectLoop(message: string): boolean {
  return /net::ERR_TOO_MANY_REDIRECTS/.test(message);
}

// --- Circuit breaker ---------------------------------------------------------

export type BreakerReason = TripVerdict | "rate_limited" | "manual";

export interface BreakerState {
  open: boolean;
  reason: BreakerReason | null;
  tripped_at: string | null;
  /** null while open means "until resume". */
  until: string | null;
  url: string | null;
  note: string | null;
}

const CLOSED: BreakerState = { open: false, reason: null, tripped_at: null, until: null, url: null, note: null };
export const AUTO_TRIP_MS = 24 * 60 * 60_000;

const REASON_TEXT: Record<BreakerReason, string> = {
  checkpoint: "LinkedIn asked for a security verification",
  captcha: "LinkedIn showed a CAPTCHA or human check",
  unusual_activity: "LinkedIn reported unusual activity",
  restricted: "LinkedIn shows the account as restricted",
  login_wall: "LinkedIn signed the automation browser out",
  rate_limited: "LinkedIn is limiting requests from this session",
  manual: "Automation was paused by you",
};

function recoveryStep(reason: BreakerReason | null): string {
  switch (reason) {
    case "manual":
      return "Call the resume tool when you want to continue.";
    case "login_wall":
      return "Run `npx @danishfareed/linkedin-mcp login`, sign in, and the pause clears itself.";
    case "rate_limited":
      return "Wait until then; don't retry or resume early. If it happens again, lower your caps with set_limits.";
    default:
      return "Run `npx @danishfareed/linkedin-mcp login` to open a visible window, resolve the check on LinkedIn yourself, then call the resume tool. Do not retry automatically.";
  }
}

/**
 * Circuit breaker persisted to disk. When open, every tool refuses until it
 * expires (24 h for automatic trips, the cooldown for rate limits) or the user
 * resumes.
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
    const reason = state.reason ? (REASON_TEXT[state.reason] ?? "Automation is paused") : "Automation is paused";
    const when = state.until ? `It reopens automatically at ${formatLocal(new Date(state.until))}.` : "It stays paused until you resume it.";
    throw new LinkedInMcpError("CIRCUIT_OPEN", `All LinkedIn actions are paused: ${reason}. ${when}`, recoveryStep(state.reason), { ...state });
  }

  /**
   * Opens the breaker. Automatic trips last 24 h and manual ones until resume,
   * unless `durationMs` says otherwise (null means until resume).
   */
  async trip(reason: BreakerReason, opts: { url?: string; durationMs?: number | null; note?: string } = {}): Promise<BreakerState> {
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

  /** Pause for a throttling cooldown. Kept apart from checkpoints, which need the user to act. */
  async tripRateLimited(retryAfterSeconds: number, opts: { url?: string; note?: string } = {}): Promise<BreakerState> {
    return this.trip("rate_limited", { ...opts, durationMs: retryAfterSeconds * 1000 });
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

export function checkpointError(verdict: TripVerdict, url: string): LinkedInMcpError {
  if (verdict === "login_wall") {
    return new LinkedInMcpError(
      "NOT_LOGGED_IN",
      "LinkedIn showed a sign-in page, so the session has ended. Automation is paused.",
      "Run `npx @danishfareed/linkedin-mcp login`, sign in, then try again.",
      { url },
    );
  }
  if (verdict === "restricted") {
    return new LinkedInMcpError(
      "CHECKPOINT",
      `${REASON_TEXT.restricted}. All automation is paused for 24 hours.`,
      "Do not retry. Open linkedin.com in your normal browser and follow LinkedIn's steps to restore the account. Signing in again here won't help until LinkedIn lifts the restriction.",
      { verdict, url },
    );
  }
  return new LinkedInMcpError(
    "CHECKPOINT",
    `${REASON_TEXT[verdict]}. All automation is paused for 24 hours to protect your account.`,
    "Do not retry. Run `npx @danishfareed/linkedin-mcp login` to open a visible window, resolve the check on LinkedIn yourself, then call the resume tool.",
    { verdict, url },
  );
}
