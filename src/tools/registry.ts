import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { AppContext } from "../context.js";
import { invalidInput, toMcpError } from "../errors.js";

export interface ToolDef<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: Omit<ToolAnnotations, "title">;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: AppContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

export const READ: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
export const WRITE_PREVIEW: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const LOCAL: Omit<ToolAnnotations, "title"> = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

/** Appended to every write tool's description. */
export const PREVIEW_NOTE =
  " This tool does not send anything to LinkedIn. It returns a preview and a confirmation_token. " +
  "Show the preview to the user word for word and call confirm_action only after the user explicitly approves it.";

function ok(result: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
}

function fail(err: unknown): CallToolResult {
  const e = toMcpError(err);
  if (e.code === "INTERNAL") console.error("[linkedin-mcp]", err);
  return { isError: true, content: [{ type: "text", text: JSON.stringify(e.toJSON(), null, 2) }] };
}

/** Runs a tool handler and converts the result or error into an MCP tool result. */
export async function invoke<S extends z.ZodRawShape>(tool: ToolDef<S>, args: unknown, ctx: AppContext): Promise<CallToolResult> {
  try {
    const parsed = z.object(tool.input).safeParse(args ?? {});
    if (!parsed.success) {
      return fail(invalidInput(parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")));
    }
    return ok(await tool.handler(parsed.data, ctx));
  } catch (err) {
    return fail(err);
  }
}

export function registerTools(server: McpServer, ctx: AppContext, tools: ToolDef[]): void {
  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.input,
        annotations: { title: tool.title, ...tool.annotations },
      },
      (args: unknown) => invoke(tool, args, ctx),
    );
  }
}
