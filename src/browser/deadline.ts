import { AsyncLocalStorage } from "node:async_hooks";
import { LinkedInMcpError } from "../errors.js";

/**
 * A time budget for one tool call, so we answer before the MCP client gives
 * up (many stop waiting at 60 s). Browser work checks it before each
 * navigation and pacing step and stops with TIMEOUT once it runs out.
 *
 * Page code can check it too: `nav.deadline.remainingMs()`, or
 * `nav.deadline.check("send")` right before an irreversible click. Never
 * check it after one: a TIMEOUT there would report a sent action as failed.
 */
export class Deadline {
  private readonly endsAt: number;

  constructor(
    readonly budgetMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.endsAt = now() + budgetMs;
  }

  /** A deadline that never runs out. */
  static unlimited(): Deadline {
    return new Deadline(Number.POSITIVE_INFINITY);
  }

  remainingMs(): number {
    return Math.max(0, this.endsAt - this.now());
  }

  expired(): boolean {
    return this.remainingMs() <= 0;
  }

  /** Throws TIMEOUT with `details.stage` if the budget is used up. */
  check(stage: string): void {
    if (this.expired()) throw deadlineExceeded(stage, this.budgetMs);
  }

  /** `ms`, cut down to what is left of the budget. */
  clamp(ms: number): number {
    return Math.max(0, Math.min(ms, this.remainingMs()));
  }
}

const current = new AsyncLocalStorage<Deadline>();

/** Runs `fn` with `deadline` as the current call's deadline (see `currentDeadline`). */
export function runWithDeadline<T>(deadline: Deadline, fn: () => Promise<T>): Promise<T> {
  return current.run(deadline, fn);
}

/**
 * The deadline of the browser call this code runs in, if any. Lets element
 * lookups cap their own timeouts without every caller passing it along.
 */
export function currentDeadline(): Deadline | undefined {
  return current.getStore();
}

/** Readable text for the stages the browser layer uses. Page code may pass any other string. */
const STAGE_TEXT: Record<string, string> = {
  queue: "waiting for an earlier call to finish",
  launch: "starting the browser",
  pacing: "pausing between actions",
  navigation: "loading a LinkedIn page",
  page_wait: "waiting for the page content",
  typing: "typing",
  scroll: "scrolling",
  send: "getting ready to send (nothing was sent)",
};

export function deadlineExceeded(stage: string, budgetMs: number): LinkedInMcpError {
  const seconds = Math.round(budgetMs / 1000);
  return new LinkedInMcpError(
    "TIMEOUT",
    `This call ran out of its ${seconds}-second time budget while ${STAGE_TEXT[stage] ?? stage}, so linkedin-mcp stopped before your AI client gave up waiting.`,
    "Try again. If it keeps happening and your client allows longer calls, raise LINKEDIN_MCP_TOOL_TIMEOUT_SECONDS.",
    { stage, budget_ms: budgetMs },
  );
}
