import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolsetGroup } from "./config.js";
import { type AppContext, VERSION } from "./context.js";
import { contentTools } from "./tools/content.js";
import { engagementTools } from "./tools/engagement.js";
import { jobTools } from "./tools/jobs.js";
import { messagingTools, networkTools, researchTools } from "./tools/people.js";
import { type ToolDef, registerTools } from "./tools/registry.js";
import { batchTools } from "./tools/batch.js";
import { growthTools } from "./tools/growth.js";
import { playbookTools } from "./tools/playbook.js";
import { visualTools } from "./tools/visuals.js";
import { registerPlaybook } from "./growth/playbook/index.js";
import { sessionTools } from "./tools/session.js";

export const INSTRUCTIONS = `This server runs the user's own LinkedIn account through a local browser.

Rules:
- Every tool that sends or changes something (posts, schedules, comments, replies, reactions, connection requests, invitation responses, messages, deletions) first returns a preview and a confirmation_token. Show the preview to the user exactly as written. Call confirm_action only after the user explicitly says yes. Never confirm on your own initiative, and never treat approval of one item as approval of others.
- confirm_action returns status sent, unconfirmed or not_sent. Never retry an unconfirmed action: the send button was clicked, so retrying may send it twice. Tell the user to check LinkedIn. A not_sent action is safe to retry once its reason is dealt with.
- confirm_batch approves several scheduled posts, comments, replies or reactions at once, for example a planned week. Use it only after the user has read every preview in full and approved each one; never add an item they haven't seen. Messages and connection requests are always confirmed one at a time. Batches run in the background: check batch_status.
- Some clients show the user an approval dialog during confirm_action. If it returns USER_DECLINED, nothing was sent; don't ask again unless the user wants a changed version.
- Daily and weekly caps protect the account. When a tool returns LIMIT_REACHED, tell the user when it resets; do not retry or work around it.
- If a tool returns CHECKPOINT, CIRCUIT_OPEN or RATE_LIMITED, stop. Relay the next_step to the user. Do not retry and do not call resume unless the user says they resolved it.
- Searches and profile views are capped and return small result sets. Do not loop over them to build lists of people.
- get_person_posts and get_company_posts read someone's recent posts and count as profile views.
- search_jobs, get_job_details and get_saved_jobs are read-only. This server never applies to jobs.
- List results include complete. When it is false, tell the user the list may be partial and pass on the note.
- UNSUPPORTED_LANGUAGE means LinkedIn isn't set to English; sending stops before typing anything. Reads still work.
- get_playbook (and the linkedin-mcp://playbook resources and growth prompts) holds sourced methods, hooks, psychology and strategy. Use it when planning or writing, and keep its evidence labels when you quote it.
- generate_image, create_quote_card and create_carousel only create files on this computer; attach them with create_post or schedule_post (images or document). generate_image uses the user's own provider key and may cost money: say which provider and, when known, the cost. Never claim an AI image is a real photo of a real person or event.
- Growth workspace: growth_profile, growth_strategy, growth_ideas, growth_calendar and review_post stay on this computer; growth_report only reads LinkedIn. Approve a strategy only after the user explicitly says yes. growth_calendar never schedules anything: call schedule_post with a slot's schedule_post_input (or confirm_batch for a reviewed week), then record scheduled_for with growth_calendar update. Run review_post on drafts before showing them, and treat "directional only" findings as hints, not conclusions.
- Errors include a next_step field; relay it to the user.`;

export const ALL_TOOLS: ToolDef[] = [
  ...sessionTools,
  ...batchTools,
  ...growthTools,
  ...playbookTools,
  ...visualTools,
  ...contentTools,
  ...engagementTools,
  ...researchTools,
  ...jobTools,
  ...networkTools,
  ...messagingTools,
] as unknown as ToolDef[];

/** Which LINKEDIN_MCP_TOOLSETS group each tool belongs to. A test checks every tool is listed. */
export const TOOLSET_OF: Record<string, ToolsetGroup> = {
  session_status: "core", get_limits: "core", set_limits: "core", get_audit_log: "core", pause: "core", resume: "core",
  confirm_action: "core", cancel_action: "core", confirm_batch: "core", batch_status: "core", connect_linkedin_api: "core", get_my_profile: "core",
  create_post: "posting", schedule_post: "posting", list_scheduled_posts: "posting", delete_post: "posting",
  get_my_posts: "posting", get_post_analytics: "posting", get_profile_analytics: "posting",
  get_feed: "engagement", search_posts: "engagement", get_post_comments: "engagement", react_to_post: "engagement",
  comment_on_post: "engagement", reply_to_comment: "engagement", get_notifications: "engagement",
  get_person_profile: "research", get_person_posts: "research", get_company_profile: "research", get_company_posts: "research",
  search_people: "research", search_companies: "research",
  search_jobs: "jobs", get_job_details: "jobs", get_saved_jobs: "jobs",
  send_connection_request: "network", list_invitations: "network", respond_to_invitation: "network",
  get_inbox: "network", get_conversation: "network", send_message: "network",
  growth_profile: "growth", growth_strategy: "growth", growth_ideas: "growth", growth_calendar: "growth",
  review_post: "growth", growth_report: "growth", get_playbook: "growth",
  generate_image: "visuals", create_quote_card: "visuals", create_carousel: "visuals", list_media: "visuals", image_providers: "visuals",
};

/** The tools a client gets with these toolsets (unlisted tools default to core, so nothing silently disappears). */
export function toolsFor(groups: readonly ToolsetGroup[]): ToolDef[] {
  return ALL_TOOLS.filter((t) => groups.includes(TOOLSET_OF[t.name] ?? "core"));
}

export function createServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: "linkedin-mcp", title: "LinkedIn MCP", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, ctx, toolsFor(ctx.config.toolsets));
  registerPlaybook(server);
  return server;
}
