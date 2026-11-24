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

/**
 * Clients may render links as clickable. Drop only the scheme so the full
 * host, path, query and fragment stay visible: what you read is what is sent.
 */
function plainLinks(text: string): string {
  return text.replace(/https?:\/\//g, "");
}

function label(key: string): string {
  const words = key.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Renders any preview value as text. Nothing is dropped: nested objects and lists are spelled out. */
function render(value: unknown): string {
  if (value === null || value === undefined) return "(none)";
  if (typeof value === "string") return plainLinks(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.length ? value.map((v) => `- ${render(v).replace(/\n/g, "\n  ")}`).join("\n") : "(none)";
  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${label(k)}: ${render(v)}`)
      .join(", ");
  }
  return plainLinks(String(value));
}

/**
 * Builds the dialog text from a preview: the action as the heading, then
 * every field. Long text and lists get their own block so they read in full.
 */
export function confirmationMessage(kind: string, preview: Record<string, unknown> | undefined): string {
  const action = typeof preview?.action === "string" ? preview.action : (ACTION_NAMES[kind] ?? `Run ${kind}`);
  const lines = [`LinkedIn: ${plainLinks(action)}?`, ""];
  const long: string[] = [];
  for (const [key, value] of Object.entries(preview ?? {})) {
    if (key === "action" || key === "dry_run" || value === undefined) continue;
    const text = render(value);
    if (Array.isArray(value) || text.length > 80 || text.includes("\n")) long.push(`${label(key)}:\n${text}`);
    else lines.push(`${label(key)}: ${text}`);
  }
  if (long.length) lines.push("", ...long.flatMap((block) => [block, ""]));
  return lines.join("\n").trim();
}

/**
 * Some clients decline every dialog automatically (headless or autopilot
 * modes, SDKs without a dialog handler). Say how to fix that, so a refusal
 * nobody made doesn't look like a broken server.
 */
export function declinedInClient(action: string): LinkedInMcpError {
  const base = userDeclined();
  return new LinkedInMcpError(
    "USER_DECLINED",
    base.message,
    `${base.nextStep} If nobody saw an approval dialog (for example a headless or autopilot mode that declines dialogs automatically), set LINKEDIN_MCP_CONFIRM_IN_CLIENT=false; previews and confirmation tokens still protect every send.`,
    { dialog_result: action },
  );
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
  throw declinedInClient(result.action);
}
