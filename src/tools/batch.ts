import { randomBytes } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { invalidInput, toMcpError, userDeclined } from "../errors.js";
import type { PendingAction } from "../safety/confirm.js";
import { clientCanConfirm, confirmationMessage } from "./confirm-in-client.js";
import { defineTool } from "./registry.js";
import { executeWrite } from "./write.js";

/**
 * Approving a planned week in one sitting. Every item still has its own
 * preview and token; the dialog shows each one in full with its own tick box
 * (all unticked), so nothing is sent that the user didn't tick. Messages and
 * connection requests stay one at a time.
 */
export const BATCHABLE_KINDS = ["schedule_post", "comment_on_post", "reply_to_comment", "react_to_post"] as const;
const MAX_ITEMS = 10;
/** Errors that mean "stop everything", not "skip this one". */
const STOP_CODES = new Set(["CIRCUIT_OPEN", "CHECKPOINT", "RATE_LIMITED", "NOT_LOGGED_IN", "BROWSER_UNAVAILABLE", "UNSUPPORTED_LANGUAGE"]);

type ItemStatus = "approved" | "running" | "sent" | "unconfirmed" | "not_sent" | "dry_run" | "failed" | "skipped" | "not_started";

interface BatchItem {
  n: number;
  action: string;
  summary: string;
  status: ItemStatus;
  result?: unknown;
  error?: { code: string; message: string; next_step: string };
}

interface BatchJob {
  job_id: string;
  state: "running" | "done" | "stopped";
  started_at: string;
  finished_at: string | null;
  stop_reason?: string;
  items: BatchItem[];
}

const jobs = new Map<string, BatchJob>();
const KEEP_JOBS = 20;

function firstLine(text: unknown): string {
  if (typeof text !== "string") return "";
  const line = text.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 70 ? `${line.slice(0, 69)}…` : line;
}

export function summarize(action: PendingAction): string {
  const p = action.preview ?? {};
  const label = typeof p.action === "string" ? p.action : action.kind;
  const when = typeof p.publish_at === "string" ? ` for ${p.publish_at}` : "";
  const line = firstLine(p.text);
  return `${label}${when}${line ? `: "${line}"` : ""}`;
}

/** One dialog, one unticked box per item. Returns the item numbers the user ticked. */
async function askForTicks(server: McpServer, actions: PendingAction[]): Promise<Set<number>> {
  const blocks = actions.map((a, i) => `${i + 1}.\n${confirmationMessage(a.kind, a.preview)}`);
  const message = [`LinkedIn: tick each of these ${actions.length} actions you want sent. Unticked ones are discarded.`, "", ...blocks.flatMap((b) => [b, ""])].join("\n").trim();
  const properties = Object.fromEntries(actions.map((a, i) => [`item_${i + 1}`, { type: "boolean" as const, title: `${i + 1}. ${summarize(a)}`, default: false }]));
  let result;
  try {
    result = await server.server.elicitInput({ mode: "form", message, requestedSchema: { type: "object", properties } }, { timeout: 15 * 60_000 });
  } catch {
    throw userDeclined();
  }
  if (result.action !== "accept") throw userDeclined();
  const ticked = new Set<number>();
  for (let i = 1; i <= actions.length; i++) if (result.content?.[`item_${i}`] === true) ticked.add(i);
  if (!ticked.size) throw userDeclined();
  return ticked;
}

async function runJob(ctx: AppContext, job: BatchJob, actions: PendingAction[]): Promise<void> {
  for (const item of job.items) {
    if (item.status !== "approved") continue;
    if (job.state === "stopped") {
      item.status = "not_started";
      continue;
    }
    item.status = "running";
    const action = actions[item.n - 1]!;
    try {
      const outcome = await executeWrite(ctx, action.kind, action.params, action.preview);
      item.status = outcome.status as ItemStatus;
      item.result = outcome;
    } catch (err) {
      const e = toMcpError(err);
      item.status = "failed";
      item.error = { code: e.code, message: e.message, next_step: e.nextStep };
      if (STOP_CODES.has(e.code)) {
        job.state = "stopped";
        job.stop_reason = `${e.code}: ${e.message}`;
      }
    }
  }
  if (job.state === "running") job.state = "done";
  job.finished_at = ctx.clock().toISOString();
}

function remember(job: BatchJob): void {
  jobs.set(job.job_id, job);
  while (jobs.size > KEEP_JOBS) jobs.delete(jobs.keys().next().value!);
}

export const batchTools = [
  defineTool({
    name: "confirm_batch",
    title: "Confirm several previewed actions",
    description:
      `Approve up to ${MAX_ITEMS} previewed actions in one go: scheduled posts (a planned week), comments, replies to comments and reactions. ` +
      "Each item must already have its own preview and confirmation_token from schedule_post, comment_on_post, reply_to_comment or react_to_post. " +
      "Only call this after the user has seen every preview in full and approved each one; never include an item they haven't seen. " +
      "If the AI client supports dialogs, the user ticks each item to send and unticked items are discarded. " +
      "Items run one at a time in the background; call batch_status for results. Messages and connection requests can't be batched.",
    input: { confirmation_tokens: z.array(z.string().min(10)).min(2).max(MAX_ITEMS) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx, call) => {
      const tokens = args.confirmation_tokens.map((t) => t.trim());
      if (new Set(tokens).size !== tokens.length) throw invalidInput("The same confirmation token appears more than once.");
      // Check every token first, so a bad one doesn't burn the rest.
      const inspected = tokens.map((t) => ctx.confirm.inspect(t));
      const unsupported = inspected.filter((a) => !(BATCHABLE_KINDS as readonly string[]).includes(a.kind));
      if (unsupported.length) {
        throw invalidInput(`These can't be confirmed in a batch: ${[...new Set(unsupported.map((a) => a.kind))].join(", ")}. Confirm them one at a time with confirm_action.`);
      }
      const actions = tokens.map((t) => ctx.confirm.redeem(t));

      const askedInClient = ctx.config.confirmInClient && clientCanConfirm(call.server);
      const ticked = askedInClient ? await askForTicks(call.server!, actions) : new Set(actions.map((_, i) => i + 1));

      const job: BatchJob = {
        job_id: randomBytes(6).toString("hex"),
        state: "running",
        started_at: ctx.clock().toISOString(),
        finished_at: null,
        items: actions.map((a, i) => ({ n: i + 1, action: a.kind, summary: summarize(a), status: ticked.has(i + 1) ? "approved" : "skipped" })),
      };
      remember(job);
      void runJob(ctx, job, actions);
      return {
        job_id: job.job_id,
        state: job.state,
        approved: ticked.size,
        skipped: actions.length - ticked.size,
        ...(askedInClient ? { approved_in_client: true } : {}),
        items: job.items.map(({ n, action, summary, status }) => ({ n, action, summary, status })),
        next_step: "The approved items are running one at a time (scheduling takes about a minute each). Call batch_status with this job_id to see the results.",
      };
    },
  }),

  defineTool({
    name: "batch_status",
    title: "Check a batch of actions",
    description: "Progress and results of a confirm_batch job: each item's status (sent, unconfirmed, not_sent, failed, skipped, not_started) and details.",
    input: { job_id: z.string().min(6) },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => {
      const job = jobs.get(args.job_id);
      if (!job) throw invalidInput("Unknown job_id. Batch results are kept until the server restarts; check get_audit_log for older actions.");
      const count = (s: ItemStatus) => job.items.filter((i) => i.status === s).length;
      return {
        ...job,
        totals: { sent: count("sent"), unconfirmed: count("unconfirmed"), not_sent: count("not_sent"), failed: count("failed"), skipped: count("skipped"), not_started: count("not_started"), dry_run: count("dry_run") },
        ...(job.items.some((i) => i.status === "unconfirmed") ? { warning: "Don't retry unconfirmed items: check LinkedIn first, or they may be posted twice." } : {}),
      };
    },
  }),
];
