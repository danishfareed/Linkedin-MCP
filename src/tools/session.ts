import { existsSync, readdirSync } from "node:fs";
import { z } from "zod";
import { hasSessionCookie } from "../browser/session.js";
import { patchFileConfig } from "../config.js";
import { withBrowser } from "../context.js";
import { LinkedInMcpError, toMcpError } from "../errors.js";
import { readMyProfile } from "../linkedin/pages/profile.js";
import { LIMIT_ACTIONS, LIMIT_TABLE, validateLimitChanges } from "../safety/limits.js";
import { askUserToConfirm, clientCanConfirm } from "./confirm-in-client.js";
import { LOCAL, READ, defineTool } from "./registry.js";
import { executeWrite } from "./write.js";

const limitShape = Object.fromEntries(
  LIMIT_ACTIONS.map((a) => [a, z.number().int().min(0).max(LIMIT_TABLE[a].ceiling).optional().describe(`${LIMIT_TABLE[a].label} per day (default ${LIMIT_TABLE[a].default}, max ${LIMIT_TABLE[a].ceiling}).`)]),
) as Record<(typeof LIMIT_ACTIONS)[number], z.ZodOptional<z.ZodNumber>>;

function profileSaved(dir: string): boolean {
  try {
    return existsSync(dir) && readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

export const sessionTools = [
  defineTool({
    name: "session_status",
    title: "Check LinkedIn session status",
    description:
      "Whose LinkedIn account linkedin-mcp is set up for, whether automation is paused, warm-up status, read-only and dry-run modes. " +
      "By default it answers from saved state without opening the browser (and checks the session cookie if the browser is already open). " +
      "Set verify=true to load your profile and confirm you're signed in (uses one page load).",
    input: { verify: z.boolean().default(false) },
    annotations: READ,
    handler: async (args, ctx) => {
      const breaker = await ctx.breaker.state();
      let loggedIn: boolean | null = null;
      let checkedBy: "saved_state" | "cookie" | "page" = "saved_state";
      let problem: { code: string; message: string; next_step: string } | null = null;
      try {
        if (args.verify) {
          const me = await withBrowser(ctx, (nav) => readMyProfile(nav, []));
          await ctx.account.update({ name: me.name, profile_url: me.profile_url, public_id: me.public_id, last_verified_at: ctx.clock().toISOString() });
          loggedIn = true;
          checkedBy = "page";
        } else if (ctx.session.isOpen()) {
          loggedIn = await ctx.session.run((nav) => hasSessionCookie(nav.page.context()), { quiet: true });
          checkedBy = "cookie";
        }
      } catch (err) {
        const e = toMcpError(err);
        if (e.code === "NOT_LOGGED_IN") loggedIn = false;
        else problem = { code: e.code, message: e.message, next_step: e.nextStep };
      }
      if (loggedIn) await ctx.limits.startWarmupIfNeeded();
      const account = await ctx.account.get();
      const limits = await ctx.limits.status();
      const neverSignedIn = !account.first_login_at && !profileSaved(ctx.config.paths.profile);
      return {
        logged_in: loggedIn,
        checked_by: checkedBy,
        account: { name: account.name, profile_url: account.profile_url, last_verified_at: account.last_verified_at },
        paused: breaker.open ? { reason: breaker.reason, since: breaker.tripped_at, until: breaker.until, note: breaker.note } : null,
        warmup: limits.warmup,
        read_only: ctx.config.readOnly,
        dry_run: ctx.config.dryRun,
        working_hours: ctx.config.workingHours,
        ...(problem ? { problem } : {}),
        ...(loggedIn === false || neverSignedIn
          ? { next_step: "Run `npx @danishfareed/linkedin-mcp login` in a terminal and sign in." }
          : loggedIn === null
            ? { note: "Checked from saved state without opening the browser. Call again with verify=true to confirm the session on LinkedIn." }
            : {}),
      };
    },
  }),

  defineTool({
    name: "get_limits",
    title: "Get usage limits",
    description: "Today's and this week's usage against each safety cap, the caps in effect (halved during warm-up), hard ceilings and reset times.",
    input: {},
    annotations: READ,
    handler: async (_args, ctx) => ({ ...(await ctx.limits.status()), working_hours: ctx.config.workingHours, dry_run: ctx.config.dryRun }),
  }),

  defineTool({
    name: "set_limits",
    title: "Change daily limits",
    description:
      "Change daily caps. You can lower any cap freely and raise it up to its hard ceiling, never above. Saved to config.json in the linkedin-mcp data folder. Warm-up still halves caps for the first 14 days.",
    input: limitShape,
    annotations: LOCAL,
    handler: async (args, ctx) => {
      const changes = Object.fromEntries(Object.entries(args).filter(([, v]) => v !== undefined));
      if (!Object.keys(changes).length) throw new LinkedInMcpError("INVALID_INPUT", "No limits were given.", "Pass at least one limit, e.g. { \"comment\": 10 }.");
      validateLimitChanges(changes);
      const saved = await patchFileConfig(ctx.config.paths, (c) => ({ ...c, limits: { ...c.limits, ...changes } }));
      ctx.config.limits = saved.limits ?? {};
      return { updated: changes, ...(await ctx.limits.status()) };
    },
  }),

  defineTool({
    name: "get_audit_log",
    title: "Get the audit log",
    description: "Recent write actions (posts, comments, reactions, messages, invitations, deletions), guard trips and pauses, newest first. Message text is never stored, only a hash.",
    input: { limit: z.number().int().min(1).max(200).default(50) },
    annotations: READ,
    handler: async (args, ctx) => ({ entries: await ctx.audit.recent(args.limit) }),
  }),

  defineTool({
    name: "pause",
    title: "Pause all LinkedIn automation",
    description: "Stop all LinkedIn actions until resume is called, or for a number of minutes.",
    input: { minutes: z.number().int().min(1).max(60 * 24 * 30).optional(), reason: z.string().max(200).optional() },
    annotations: LOCAL,
    handler: async (args, ctx) => {
      const state = await ctx.breaker.trip("manual", { durationMs: args.minutes ? args.minutes * 60_000 : null, note: args.reason });
      await ctx.audit.record({ tool: "pause", target: null, text_hash: null, result: "paused", detail: args.reason });
      await ctx.session.close();
      return { paused: true, until: state.until ?? "until you call resume" };
    },
  }),

  defineTool({
    name: "resume",
    title: "Resume LinkedIn automation",
    description:
      "Resume after a pause. If LinkedIn showed a security check, only resume after the user has resolved it themselves in a visible window (`npx @danishfareed/linkedin-mcp login`).",
    input: {},
    annotations: LOCAL,
    handler: async (_args, ctx) => {
      const before = await ctx.breaker.state();
      await ctx.breaker.reset();
      await ctx.audit.record({ tool: "resume", target: null, text_hash: null, result: "resumed", detail: before.reason ?? undefined });
      return {
        resumed: true,
        was_paused_for: before.open ? before.reason : null,
        ...(before.open && before.reason !== "manual" ? { reminder: "If LinkedIn showed a security check, make sure it was resolved in the browser first. Another check soon after usually means slowing down." } : {}),
      };
    },
  }),

  defineTool({
    name: "confirm_action",
    title: "Confirm a previewed action",
    description:
      "Execute an action previewed by another tool (post, schedule, comment, reply, reaction, connection request, invitation response, message, deletion). " +
      "Only call this after the user has seen the preview and clearly said yes. Tokens are single-use and expire after 10 minutes. " +
      "If the AI client supports it, the user is also asked to approve in a dialog, and declining there sends nothing.",
    input: { confirmation_token: z.string().min(10) },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: async (args, ctx, call) => {
      const action = ctx.confirm.redeem(args.confirmation_token);
      const askedInClient = ctx.config.confirmInClient && clientCanConfirm(call.server);
      if (askedInClient) await askUserToConfirm(call.server!, action.kind, action.preview);
      const outcome = await executeWrite(ctx, action.kind, action.params, action.preview);
      return askedInClient ? { ...outcome, approved_in_client: true } : outcome;
    },
  }),

  defineTool({
    name: "cancel_action",
    title: "Cancel a previewed action",
    description: "Discard a preview's confirmation token when the user decides not to go ahead.",
    input: { confirmation_token: z.string().min(10) },
    annotations: LOCAL,
    handler: async (args, ctx) => ({ cancelled: ctx.confirm.cancel(args.confirmation_token) }),
  }),
];
