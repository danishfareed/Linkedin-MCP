import { LinkedInMcpError, toMcpError } from "../errors.js";

/**
 * What a write page-function reports back. Exactly three outcomes:
 *
 * - `sent`: verified on the page after the final click.
 * - `unconfirmed` (`retry_safe: false`): the final Send/Post click happened,
 *   but verification failed or an error came after it. It may be live, so a
 *   retry could send it twice.
 * - `not_sent` (`retry_safe: true`): stopped before the final click, with a
 *   reason (already pending, an email-required prompt, a Premium upsell…).
 *
 * The "commit point" is the final click or key press that sends. Errors
 * before it stay errors (nothing was sent); anything thrown after it becomes
 * `unconfirmed`.
 */
export type WriteStatus = "sent" | "unconfirmed" | "not_sent";

export interface WriteResult {
  outcome: WriteStatus;
  retry_safe: boolean;
  /** Short machine-readable reason for `unconfirmed` and `not_sent`. */
  reason?: string;
  /** One plain sentence explaining the reason. */
  detail?: string;
  /** What to do next, when the page knows better than the generic advice. */
  next_step?: string;
  /** The step whose click was the commit point, for `unconfirmed`. */
  commit_step?: string;
  /** The error that came after the commit point, for `unconfirmed`. */
  error?: { code: string; message: string; next_step: string };
  /** Anything else worth returning (a post URL, whether a note was included…). */
  data?: Record<string, unknown>;
}

const STATUSES: readonly WriteStatus[] = ["sent", "unconfirmed", "not_sent"];

export function sent(data?: Record<string, unknown>): WriteResult {
  return { outcome: "sent", retry_safe: false, ...(data ? { data } : {}) };
}

export function unconfirmed(reason: string, detail: string, data?: Record<string, unknown>): WriteResult {
  return { outcome: "unconfirmed", retry_safe: false, reason, detail, ...(data ? { data } : {}) };
}

export function notSent(reason: string, detail: string, opts: { next_step?: string; data?: Record<string, unknown> } = {}): WriteResult {
  return {
    outcome: "not_sent",
    retry_safe: true,
    reason,
    detail,
    ...(opts.next_step ? { next_step: opts.next_step } : {}),
    ...(opts.data ? { data: opts.data } : {}),
  };
}

export function isWriteResult(value: unknown): value is WriteResult {
  return typeof value === "object" && value !== null && STATUSES.includes((value as { outcome?: unknown }).outcome as WriteStatus);
}

/** An error that came after the commit point, as an `unconfirmed` result. */
export function unconfirmedAfterError(err: unknown, commitStep: string | null): WriteResult {
  const e = toMcpError(err);
  return {
    ...unconfirmed("error_after_send", `An error came after the final click (${e.message})`),
    ...(commitStep ? { commit_step: commitStep } : {}),
    error: { code: e.code, message: e.message, next_step: e.nextStep },
  };
}

/**
 * Normalises whatever a write's `run` returned. Results that don't declare an
 * outcome were never verified, so they count as `unconfirmed`, never `sent`.
 */
export function toWriteResult(value: unknown): WriteResult {
  if (isWriteResult(value)) {
    // Retry safety follows from the outcome, whatever the page function said.
    return { ...value, retry_safe: value.outcome === "not_sent" };
  }
  return unconfirmed(
    "not_verified",
    "The action ran, but it doesn't report a verified result",
    value === undefined || value === null ? undefined : { raw: value as unknown },
  );
}

/**
 * Tracks whether the commit point has been passed. One per write attempt.
 * `cancel` is used by the caller's deadline: once cancelled before the commit
 * point, `commit` throws instead of letting the final click happen late.
 */
export class WriteAttempt {
  private step: string | null = null;
  private cancelled: string | null = null;

  get committed(): boolean {
    return this.step !== null;
  }

  get commitStep(): string | null {
    return this.step;
  }

  /** Call immediately before the click or key press that sends. */
  commit(step: string): void {
    if (this.step) return;
    if (this.cancelled) {
      throw new LinkedInMcpError(
        "TIMEOUT",
        `The action was stopped before the final click (${this.cancelled}), so nothing was sent.`,
        "Try again in a minute.",
        { step },
      );
    }
    this.step = step;
  }

  /** Returns false (and changes nothing) when the commit point was already passed. */
  cancel(reason: string): boolean {
    if (this.step) return false;
    this.cancelled = reason;
    return true;
  }
}

const attempts = new WeakMap<object, WriteAttempt>();

/** executeWrite binds its attempt to the Nav it hands to `run`. */
export function bindAttempt(nav: object, attempt: WriteAttempt): void {
  attempts.set(nav, attempt);
}

/** The attempt bound to this Nav, or a fresh one when called outside executeWrite. */
export function attemptFor(nav: object): WriteAttempt {
  let a = attempts.get(nav);
  if (!a) {
    a = new WriteAttempt();
    attempts.set(nav, a);
  }
  return a;
}

/**
 * Wraps a write page-function body. Errors before `attempt.commit()` are
 * rethrown unchanged; errors after it become an `unconfirmed` result.
 */
export async function runWrite(nav: object, body: (attempt: WriteAttempt) => Promise<WriteResult>): Promise<WriteResult> {
  const attempt = attemptFor(nav);
  try {
    return await body(attempt);
  } catch (err) {
    if (!attempt.committed) throw err;
    return unconfirmedAfterError(err, attempt.commitStep);
  }
}

/** Polls `check` until it returns true or `timeoutMs` passes. Never throws. */
export async function pollUntil(check: () => Promise<boolean>, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}
