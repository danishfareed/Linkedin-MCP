import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type AppContext, VERSION } from "./context.js";
import { contentTools } from "./tools/content.js";
import { engagementTools } from "./tools/engagement.js";
import { messagingTools, networkTools, researchTools } from "./tools/people.js";
import { type ToolDef, registerTools } from "./tools/registry.js";
import { sessionTools } from "./tools/session.js";

export const INSTRUCTIONS = `This server runs the user's own LinkedIn account through a local browser.

Rules:
- Every tool that sends or changes something (posts, schedules, comments, replies, reactions, connection requests, invitation responses, messages, deletions) first returns a preview and a confirmation_token. Show the preview to the user exactly as written. Call confirm_action only after the user explicitly says yes. Never confirm on your own initiative, and never batch-confirm several actions from one approval.
- Daily and weekly caps protect the account. When a tool returns LIMIT_REACHED, tell the user when it resets; do not retry or work around it.
- If a tool returns CHECKPOINT or CIRCUIT_OPEN, stop. Relay the next_step to the user. Do not retry and do not call resume unless the user says they resolved it.
- Searches and profile views are capped and return small result sets. Do not loop over them to build lists of people.
- Errors include a next_step field; relay it to the user.`;

export const ALL_TOOLS: ToolDef[] = [
  ...sessionTools,
  ...contentTools,
  ...engagementTools,
  ...researchTools,
  ...networkTools,
  ...messagingTools,
] as unknown as ToolDef[];

export function createServer(ctx: AppContext): McpServer {
  const server = new McpServer({ name: "linkedin-mcp", title: "LinkedIn MCP", version: VERSION }, { instructions: INSTRUCTIONS });
  registerTools(server, ctx, ALL_TOOLS);
  return server;
}
