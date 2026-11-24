import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema, type CallToolResult, type Tool, type ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { LinkedInMcpError, invalidInput, toMcpError } from "../errors.js";

/** Per-call extras. `server` is the MCP server handling this call (one per HTTP session). */
export interface ToolCall {
  server?: McpServer;
}

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: Omit<ToolAnnotations, "title">;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: AppContext, call: ToolCall) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

export const READ: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const WRITE_PREVIEW: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const LOCAL: Omit<ToolAnnotations, "title"> = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/**
 * Tools that can lead to something being sent: the preview tools and
 * confirm_action. Read-only mode hides and refuses all of them.
 */
export function isSendingTool(tool: Pick<ToolDef, "annotations">): boolean {
  return tool.annotations === WRITE_PREVIEW || tool.annotations.destructiveHint === true;
}

/** Appended to every write tool's description. */
export const PREVIEW_NOTE =
  " This tool does not send anything to LinkedIn. It returns a preview and a confirmation_token. " +
  "Show the preview to the user word for word and call confirm_action only after the user explicitly approves it.";

/** Compact JSON without null or undefined object fields: fewer tokens for the model to read. */
export function compactJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== undefined));
    }
    return v;
  });
}

function ok(result: unknown): CallToolResult {
  return { content: [{ type: "text", text: compactJson(result) }] };
}

function fail(err: unknown): CallToolResult {
  const e = toMcpError(err);
  if (e.code === "INTERNAL") console.error("[linkedin-mcp]", err);
  return { isError: true, content: [{ type: "text", text: compactJson(e.toJSON()) }] };
}

/** Runs a tool handler and converts the result or error into an MCP tool result. */
export async function invoke<S extends z.ZodRawShape>(tool: ToolDef<S>, args: unknown, ctx: AppContext, call: ToolCall = {}): Promise<CallToolResult> {
  try {
    if (ctx.config.readOnly && isSendingTool(tool)) {
      return fail(new LinkedInMcpError("INVALID_INPUT", `${tool.name} is disabled because read-only mode is on.`, "Turn off LINKEDIN_MCP_READ_ONLY to send things to LinkedIn."));
    }
    const parsed = z.object(tool.input).safeParse(args ?? {});
    if (!parsed.success) {
      return fail(invalidInput(parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")));
    }
    return ok(await tool.handler(parsed.data, ctx, call));
  } catch (err) {
    return fail(err);
  }
}

/**
 * JSON Schema keywords every major MCP client accepts in a tool's input
 * schema. Gemini's function-calling schema is the strictest subset; the
 * others accept more. Anything else is dropped from what clients see, while
 * the server keeps validating with the full zod schema, so inputs are no less
 * strict.
 */
const PORTABLE_KEYWORDS = new Set([
  "type", "description", "properties", "required", "items", "enum", "default", "nullable", "anyOf",
  "minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "title",
]);

/** Rewrites a JSON Schema into the portable subset. Exported for tests. */
export function portableSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(portableSchema);
  if (!node || typeof node !== "object") return node;
  const src = node as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(src)) {
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, portableSchema(v)]));
    } else if (key === "const") {
      out.enum = [value];
    } else if (key === "exclusiveMinimum" && typeof value === "number") {
      out.minimum = src.type === "integer" ? value + 1 : value;
    } else if (key === "exclusiveMaximum" && typeof value === "number") {
      out.maximum = src.type === "integer" ? value - 1 : value;
    } else if (key === "format") {
      if (value === "date-time") out.format = value;
    } else if (PORTABLE_KEYWORDS.has(key)) {
      out[key] = portableSchema(value);
    }
  }
  if (out.type === "object" && !out.properties) out.properties = {};
  return out;
}

/** The tool list as clients see it, built from our own definitions with portable schemas. */
export function describeTools(tools: ToolDef[]): Tool[] {
  return tools.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: portableSchema(z.toJSONSchema(z.object(tool.input), { io: "input", unrepresentable: "any" })) as Tool["inputSchema"],
    annotations: { title: tool.title, ...tool.annotations },
  }));
}

export function registerTools(server: McpServer, ctx: AppContext, tools: ToolDef[]): void {
  const registered: ToolDef[] = [];
  for (const tool of tools) {
    if (ctx.config.readOnly && isSendingTool(tool)) continue;
    registered.push(tool);
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, ...tool.annotations },
      },
      (args: unknown) => invoke(tool, args, ctx, { server }),
    );
  }
  // Replace the SDK's tool list with the portable one (public API; calls are still handled by the SDK).
  const listed = describeTools(registered);
  server.server.setRequestHandler(ListToolsRequestSchema, () => ({ tools: listed }));
}
