import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { LinkedInMcpError, userDeclined } from "../errors.js";

/**
 * Asking the user directly through the MCP client (form elicitation) means the
 * model can't approve its own preview. That matters because feed posts,
 * comments and messages are written by other people and could try to steer
 * the assistant into sending something. When the client doesn't support it,
 * the confirmation-token flow is still the gate.
 */
export function clientCanConfirm(server: McpServer | undefined): server is McpServer {
  return Boolean(server?.server.getClientCapabilities()?.elicitation?.form);
}

const ACTION_NAMES: Record<string, string> = {
  create_post: "Publish this post",
  schedule_post: "Schedule this post",
  delete_post: "Delete this post",
  comment_on_post: "Post this comment",
  reply_to_comment: "Post this reply",
  react_to_post: "Add this reaction",
  send_connection_request: "Send this connection request",
  respond_to_invitation: "Respond to this invitation",
  send_message: "Send this message",
};

/** Clients may render links as clickable; show where things go as plain text instead. */
function plainLinks(text: string): string {
  return text.replace(/https?:\/\/(?:www\.)?([^\s?#]+)[^\s]*/g, (_m, rest: string) => rest.replace(/\/$/, ""));
}

function label(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Builds the dialog text from a preview: every field, with the message text in full. */
export function confirmationMessage(kind: string, preview: Record<string, unknown> | undefined): string {
  const lines = [`${ACTION_NAMES[kind] ?? `Run ${kind}`} on LinkedIn?`, ""];
  const long: string[] = [];
  for (const [key, value] of Object.entries(preview ?? {})) {
    if (key === "action" || key === "dry_run" || value === null || value === undefined) continue;
    let text: string;
    if (typeof value === "string") text = value;
    else if (typeof value === "number" || typeof value === "boolean") text = String(value);
    else if (Array.isArray(value) && value.every((v) => typeof v === "string" || typeof v === "number")) text = value.join(", ");
    else continue;
    text = plainLinks(text);
    if (text.length > 80 || text.includes("\n")) long.push(`${label(key)}:\n${text}`);
    else lines.push(`${label(key)}: ${text}`);
  }
  if (long.length) lines.push("", ...long);
  return lines.join("\n").trim();
}

/** Resolves when the user approves in the client's dialog; throws USER_DECLINED otherwise. */
export async function askUserToConfirm(server: McpServer, kind: string, preview: Record<string, unknown> | undefined): Promise<void> {
  let result;
  try {
    result = await server.server.elicitInput(
      {
        mode: "form",
        message: confirmationMessage(kind, preview),
        requestedSchema: {
          type: "object",
          properties: { approve: { type: "boolean", title: "Yes, send it", default: false } },
          required: ["approve"],
        },
      },
      { timeout: 10 * 60_000 },
    );
  } catch (err) {
    throw new LinkedInMcpError(
      "USER_DECLINED",
      "The approval dialog in your AI client didn't get an answer, so nothing was sent.",
      "Ask for a new preview and approve it when the dialog appears.",
      { cause: err instanceof Error ? err.message.split("\n")[0] : String(err) },
    );
  }
  if (result.action === "accept" && result.content?.approve === true) return;
  throw userDeclined();
}
