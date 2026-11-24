import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { promises as fs } from "node:fs";
import { type IncomingMessage, type ServerResponse, createServer as createHttpServer } from "node:http";
import { dirname } from "node:path";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { AppContext } from "./context.js";
import { createServer } from "./server.js";

const HOST = "127.0.0.1";
const MAX_BODY = 4 * 1024 * 1024;

/** Uses the configured token, or creates one at ~/.linkedin-mcp/http-token (mode 600). */
export async function resolveHttpToken(ctx: AppContext): Promise<string> {
  if (ctx.config.http.token) return ctx.config.http.token;
  const file = ctx.config.paths.httpTokenFile;
  try {
    const existing = (await fs.readFile(file, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch {
    // create below
  }
  const token = randomBytes(32).toString("base64url");
  await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await fs.writeFile(file, `${token}\n`, { mode: 0o600 });
  return token;
}

function authorised(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.replace(/^Bearer\s+/i, ""));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

/**
 * Streamable HTTP on 127.0.0.1 only, with a bearer token and DNS-rebinding
 * protection. Each MCP session gets its own server object; they all share one
 * browser, one set of limits and one confirmation store.
 */
export async function serveHttp(ctx: AppContext, port: number): Promise<{ close: () => Promise<void>; url: string; token: string }> {
  const token = await resolveHttpToken(ctx);
  const transports = new Map<string, StreamableHTTPServerTransport>();
  const allowedHosts = [`${HOST}:${port}`, `localhost:${port}`];

  const server = createHttpServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${HOST}:${port}`);
      if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "Not found. The MCP endpoint is /mcp." });
      if (!authorised(req, token)) return sendJson(res, 401, { error: "Missing or wrong bearer token." });

      const sessionId = req.headers["mcp-session-id"];
      const existing = typeof sessionId === "string" ? transports.get(sessionId) : undefined;

      if (req.method === "POST") {
        const body = await readBody(req);
        if (existing) return void (await existing.handleRequest(req, res, body));
        if (!sessionId && isInitializeRequest(body)) {
          const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            enableDnsRebindingProtection: true,
            allowedHosts,
            onsessioninitialized: (id) => {
              transports.set(id, transport);
            },
          });
          transport.onclose = () => {
            if (transport.sessionId) transports.delete(transport.sessionId);
          };
          await createServer(ctx).connect(transport);
          return void (await transport.handleRequest(req, res, body));
        }
        return sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32000, message: "No valid session. Send an initialize request first." }, id: null });
      }

      if ((req.method === "GET" || req.method === "DELETE") && existing) return void (await existing.handleRequest(req, res));
      return sendJson(res, 400, { error: "Unknown or missing mcp-session-id." });
    } catch (err) {
      console.error("[linkedin-mcp] HTTP error:", err);
      if (!res.headersSent) sendJson(res, 500, { error: "Internal error" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => resolve());
  });

  return {
    url: `http://${HOST}:${port}/mcp`,
    token,
    close: async () => {
      for (const t of transports.values()) await t.close().catch(() => undefined);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
