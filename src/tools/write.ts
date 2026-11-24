import type { Nav } from "../browser/session.js";
import { type AppContext, withBrowser } from "../context.js";
import { LinkedInMcpError, toMcpError } from "../errors.js";
import { type WriteResult, type WriteStatus, WriteAttempt, bindAttempt, toWriteResult, unconfirmed, unconfirmedAfterError } from "../linkedin/outcome.js";
import { type AuditRecord, hashText } from "../safety/audit.js";
import type { ConfirmationTicket } from "../safety/confirm.js";
import { LIMIT_TABLE, type LimitAction, assertWorkingHours } from "../safety/limits.js";

/**
 * A write action: something that sends or changes content on LinkedIn.
 * Tools never call `run` directly. They go through prepareWrite (preview +
 * token) and confirm_action → executeWrite, which re-checks every safety rule.
 *
 * `run` should return a WriteResult (see src/linkedin/outcome.ts). Anything
 * else is treated as unverified and reported as `unconfirmed`.
 */
export interface WriteSpec<P> {
  kind: string;
  limit: LimitAction | null;
  target: (params: P) => string | null;
  text: (params: P) => string | null;
  run: (nav: Nav, params: P, ctx: AppContext) => Promise<unknown>;
}

const executors = new Map<string, WriteSpec<never>>();

export function defineWrite<P>(spec: WriteSpec<P>): WriteSpec<P> {
  executors.set(spec.kind, spec as unknown as WriteSpec<never>);
  return spec;
}

export function getExecutor(kind: string): WriteSpec<unknown> | undefined {
  return executors.get(kind) as WriteSpec<unknown> | undefined;
}

async function preflight(ctx: AppContext, spec: WriteSpec<unknown>): Promise<void> {
  await ctx.breaker.assertClosed();
  assertWorkingHours(ctx.config.workingHours, ctx.clock());
  if (spec.limit) await ctx.limits.assertAvailable(spec.limit);
}

/** Validates against every safety rule, then issues a confirmation token. Sends nothing. */
export async function prepareWrite<P>(ctx: AppContext, spec: WriteSpec<P>, params: P, preview: Record<string, unknown>): Promise<ConfirmationTicket> {
  await preflight(ctx, spec as WriteSpec<unknown>);
  return ctx.confirm.create({
    kind: spec.kind,
    params,
    preview: ctx.config.dryRun ? { ...preview, dry_run: "Dry-run mode is on: confirming will simulate this without sending." } : preview,
  });
}

/** What confirm_action returns. `retry_safe` and `next_step` tell the assistant plainly whether trying again is safe. */
export interface WriteOutcome {
  status: WriteStatus | "dry_run";
  /** True only when nothing reached LinkedIn, so trying again can't create a duplicate. */
  retry_safe: boolean;
  action: string;
  message: string;
  next_step: string;
  reason?: string;
  result?: Record<string, unknown>;
  commit_step?: string;
  error?: { code: string; message: string; next_step: string };
  /** For not_sent: the attempt was still counted once against the daily cap. */
  limit_note?: string;
  preview?: Record<string, unknown>;
  note?: string;
}

const UNCONFIRMED_NEXT_STEP =
  "Do not retry: it may already be on LinkedIn, and retrying could send it twice. Tell the user it is unconfirmed and ask them to check on LinkedIn. Only send it again if they confirm it isn't there.";

function sentence(s: string | undefined, fallback: string): string {
  const t = (s ?? fallback).trim().replace(/[.\s]+$/, "");
  return `${t}.`;
}

/** Pure: turns a page result into what the assistant sees. */
export function presentOutcome(kind: string, limit: LimitAction | null, r: WriteResult): WriteOutcome {
  const common = { action: kind, ...(r.reason ? { reason: r.reason } : {}), ...(r.data ? { result: r.data } : {}) };
  if (r.outcome === "sent") {
    return {
      status: "sent",
      retry_safe: false,
      ...common,
      message: "Done. linkedin-mcp checked LinkedIn after the final click and the result is there.",
      next_step: "Nothing more to do. Don't repeat this action: it would be a duplicate.",
    };
  }
  if (r.outcome === "unconfirmed") {
    return {
      status: "unconfirmed",
      retry_safe: false,
      ...common,
      message: `The final click went through, but linkedin-mcp couldn't confirm the result on LinkedIn: ${sentence(r.detail, "verification failed")}`,
      next_step: r.error ? `${UNCONFIRMED_NEXT_STEP} Also: ${r.error.next_step}` : UNCONFIRMED_NEXT_STEP,
      ...(r.commit_step ? { commit_step: r.commit_step } : {}),
      ...(r.error ? { error: r.error } : {}),
    };
  }
  return {
    status: "not_sent",
    retry_safe: true,
    ...common,
    message: `Nothing was sent: ${sentence(r.detail, "linkedin-mcp stopped before the final click")}`,
    next_step: r.next_step ?? "Nothing reached LinkedIn, so trying again can't create a duplicate. Deal with the reason above first.",
    ...(limit ? { limit_note: `This attempt still counted once against today's ${LIMIT_TABLE[limit].label.toLowerCase()} limit.` } : {}),
  };
}

function auditFields(r: WriteResult): Pick<AuditRecord, "result" | "reason" | "error_code" | "detail"> {
  const result = r.outcome === "sent" ? "success" : r.outcome;
  return {
    result,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.error ? { error_code: r.error.code } : {}),
    ...(r.detail ? { detail: r.detail.slice(0, 200) } : {}),
  };
}

/** Errors before the final click: nothing reached LinkedIn. Says so in the error. */
function nothingSent(e: LinkedInMcpError): LinkedInMcpError {
  return new LinkedInMcpError(e.code, e.message, e.nextStep, { ...(e.details ?? {}), nothing_sent: true });
}

/**
 * A write's share of the per-call time budget, leaving room to report back
 * before the client gives up: 5 s, or a quarter of the budget if that's less.
 */
export function writeBudgetMs(toolTimeoutMs: number): number {
  return Math.round(toolTimeoutMs - Math.min(5_000, toolTimeoutMs / 4));
}

type Settled = { kind: "value"; value: unknown } | { kind: "error"; error: unknown } | { kind: "deadline" };

async function settleWithin(work: Promise<unknown>, ms: number): Promise<Settled> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<Settled>((resolve) => {
    timer = setTimeout(() => resolve({ kind: "deadline" }), ms);
    timer.unref();
  });
  try {
    return await Promise.race([
      work.then(
        (value): Settled => ({ kind: "value", value }),
        (error: unknown): Settled => ({ kind: "error", error }),
      ),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes a confirmed write. Safety rules are checked again (time may have
 * passed since the preview), the attempt is counted against the cap before
 * any click, and every outcome goes to the audit log.
 *
 * Errors before the final click stay errors. Anything that goes wrong after
 * it, including running out of time, is reported as `unconfirmed`, never as
 * an error the assistant might retry. If time runs out before the final
 * click, the attempt is cancelled so the click can't happen late.
 */
export async function executeWrite(ctx: AppContext, kind: string, params: unknown, preview?: Record<string, unknown>): Promise<WriteOutcome> {
  const spec = getExecutor(kind);
  if (!spec) throw new Error(`No executor registered for "${kind}"`);
  await preflight(ctx, spec);
  const target = spec.target(params);
  const base = { tool: kind, target, text_hash: hashText(spec.text(params)) };

  if (ctx.config.dryRun) {
    await ctx.audit.record({ ...base, result: "dry_run" });
    return {
      status: "dry_run",
      retry_safe: true,
      action: kind,
      preview,
      message: "Simulated only.",
      next_step: "Nothing was sent. Turn off dry-run mode to send for real.",
      note: "LINKEDIN_MCP_DRY_RUN is on, so nothing was sent.",
    };
  }

  // Counted once, before any click. Nothing below consumes this cap again.
  if (spec.limit) await ctx.limits.consume(spec.limit);
  const attempt = new WriteAttempt();
  const work = withBrowser(ctx, (nav) => {
    bindAttempt(nav, attempt);
    return spec.run(nav, params, ctx);
  });
  const settled = await settleWithin(work, writeBudgetMs(ctx.config.toolTimeoutMs));

  let result: WriteResult;
  if (settled.kind === "value") {
    result = toWriteResult(settled.value);
  } else if (settled.kind === "error") {
    if (!attempt.committed) {
      const e = toMcpError(settled.error);
      await ctx.audit.record({ ...base, result: "failed", error_code: e.code, detail: e.message.slice(0, 200) });
      throw nothingSent(e);
    }
    result = unconfirmedAfterError(settled.error, attempt.commitStep);
  } else if (attempt.cancel("the time budget for one tool call ran out")) {
    void work.catch(() => undefined);
    const e = new LinkedInMcpError(
      "TIMEOUT",
      "The action took too long and was stopped before the final click, so nothing was sent.",
      "Try again in a minute. If it keeps happening, raise toolTimeoutSeconds in the config or run `npx @danishfareed/linkedin-mcp doctor`.",
      { nothing_sent: true },
    );
    await ctx.audit.record({ ...base, result: "failed", error_code: e.code, detail: e.message.slice(0, 200) });
    throw e;
  } else {
    result = {
      ...unconfirmed("timeout_after_send", "the final click happened, but checking the result took longer than the time budget for one tool call"),
      ...(attempt.commitStep ? { commit_step: attempt.commitStep } : {}),
    };
    // If verification finishes later, record what it found.
    void work.then(
      (late) => {
        if (toWriteResult(late).outcome === "sent") return ctx.audit.record({ ...base, result: "success", detail: "verified after the tool call had already returned unconfirmed" });
      },
      () => undefined,
    ).catch(() => undefined);
  }

  await ctx.audit.record({ ...base, ...auditFields(result) });
  return presentOutcome(kind, spec.limit, result);
}
