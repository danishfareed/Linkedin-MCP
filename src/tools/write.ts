import type { Nav } from "../browser/session.js";
import { type AppContext, withBrowser } from "../context.js";
import { toMcpError } from "../errors.js";
import { hashText } from "../safety/audit.js";
import type { ConfirmationTicket } from "../safety/confirm.js";
import { type LimitAction, assertWorkingHours } from "../safety/limits.js";

/**
 * A write action: something that sends or changes content on LinkedIn.
 * Tools never call `run` directly. They go through prepareWrite (preview +
 * token) and confirm_action → executeWrite, which re-checks every safety rule.
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

export interface WriteOutcome {
  status: "done" | "dry_run";
  action: string;
  preview?: Record<string, unknown>;
  result?: unknown;
  note?: string;
}

/**
 * Executes a confirmed write. Safety rules are checked again (time may have
 * passed since the preview), the attempt is counted against the cap before
 * any click, and every outcome goes to the audit log.
 */
export async function executeWrite(ctx: AppContext, kind: string, params: unknown, preview?: Record<string, unknown>): Promise<WriteOutcome> {
  const spec = getExecutor(kind);
  if (!spec) throw new Error(`No executor registered for "${kind}"`);
  await preflight(ctx, spec);
  const target = spec.target(params);
  const textHash = hashText(spec.text(params));

  if (ctx.config.dryRun) {
    await ctx.audit.record({ tool: kind, target, text_hash: textHash, result: "dry_run" });
    return { status: "dry_run", action: kind, preview, note: "LINKEDIN_MCP_DRY_RUN is on, so nothing was sent." };
  }

  if (spec.limit) await ctx.limits.consume(spec.limit);
  try {
    const result = await withBrowser(ctx, (nav) => spec.run(nav, params, ctx));
    await ctx.audit.record({ tool: kind, target, text_hash: textHash, result: "success" });
    return { status: "done", action: kind, result };
  } catch (err) {
    const e = toMcpError(err);
    await ctx.audit.record({ tool: kind, target, text_hash: textHash, result: "failed", error_code: e.code, detail: e.message.slice(0, 200) });
    throw e;
  }
}
