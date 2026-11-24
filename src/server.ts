import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AppContext, VERSION } from "./context.js";
import { contentTools } from "./tools/content.js";
import { engagementTools } from "./tools/engagement.js";
import { jobTools } from "./tools/jobs.js";
import { messagingTools, networkTools, researchTools } from "./tools/people.js";
import { type ToolDef, registerTools } from "./tools/registry.js";
import { batchTools } from "./tools/batch.js";
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
- Errors include a next_step field; relay it to the user.`;

export const ALL_TOOLS: ToolDef[] = [
  ...sessionTools,
  ...batchTools,
  ...contentTools,
  ...engagementTools,
  ...researchTools,
  ...jobTools,
  ...networkTools,
  ...messagingTools,
] as unknown as ToolDef[];

export function createServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: "linkedin-mcp", title: "LinkedIn MCP", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, ctx, ALL_TOOLS);
  return server;
}
