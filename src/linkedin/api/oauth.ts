import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { type Server, createServer } from "node:http";
import type { Paths } from "../../config.js";
import { LinkedInMcpError } from "../../errors.js";
import { type ApiToken, saveApiToken } from "./token.js";

/**
 * LinkedIn's 3-legged OAuth with a one-shot loopback callback, for the user's
 * own developer app ("Share on LinkedIn" + "Sign In with LinkedIn using
 * OpenID Connect"). The client secret never leaves this computer.
 */

export const AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const SCOPES = "openid profile w_member_social";

export interface OAuthApp {
  clientId: string;
  clientSecret: string;
  redirectPort: number;
}

export function redirectUri(port: number): string {
  return `http://localhost:${port}/callback`;
}

export function authorizationUrl(app: OAuthApp, state: string): string {
  const q = new URLSearchParams({ response_type: "code", client_id: app.clientId, redirect_uri: redirectUri(app.redirectPort), scope: SCOPES, state });
  return `${AUTH_URL}?${q.toString()}`;
}

export function missingAppError(): LinkedInMcpError {
  return new LinkedInMcpError(
    "INVALID_INPUT",
    "No LinkedIn developer app is configured, so posting through the official API isn't set up.",
    "Run `npx @danishfareed/linkedin-mcp connect-api` in a terminal: it walks you through creating the app and connecting it. Posting through the browser keeps working without it.",
  );
}

export interface Authorization {
  url: string;
  /** Resolves with the saved token once the user approves; rejects on denial, a bad state or timeout. */
  done: Promise<ApiToken>;
  cancel(): void;
}

const PAGE = (msg: string) =>
  `<!doctype html><meta charset="utf-8"><title>linkedin-mcp</title><p style="font:16px system-ui,sans-serif;margin:3rem">${msg}</p>`;

/**
 * Starts the callback server and returns the consent URL. The caller opens
 * the URL (or shows it); `done` settles when LinkedIn redirects back.
 */
export async function startAuthorization(
  app: OAuthApp,
  paths: Paths,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch; now?: () => Date } = {},
): Promise<Authorization> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? (() => new Date());
  const state = randomBytes(24).toString("base64url");
  const url = authorizationUrl(app, state);

  let settle!: { resolve: (t: ApiToken) => void; reject: (e: unknown) => void };
  const done = new Promise<ApiToken>((resolve, reject) => (settle = { resolve, reject }));
  let finished = false;

  const server: Server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", `http://localhost:${app.redirectPort}`);
    if (u.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const reply = (status: number, msg: string) => res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }).end(PAGE(msg));
    if (finished) return reply(410, "This sign-in link was already used. You can close this tab.");
    if (u.searchParams.get("state") !== state) return reply(400, "This sign-in response doesn't match the request, so it was ignored.");
    const error = u.searchParams.get("error");
    const code = u.searchParams.get("code");
    if (error || !code) {
      finished = true;
      reply(400, "LinkedIn didn't connect. You can close this tab and try again.");
      finish(new LinkedInMcpError("USER_DECLINED", `LinkedIn didn't grant access (${u.searchParams.get("error_description") ?? error ?? "no code"}).`, "Run connect-api again and click Allow on LinkedIn's page."));
      return;
    }
    finished = true;
    exchange(code).then(
      (token) => {
        reply(200, `LinkedIn connected${token.name ? ` as ${escapeHtml(token.name)}` : ""}. You can close this tab.`);
        finish(null, token);
      },
      (err: unknown) => {
        reply(500, "Connecting failed. Check the terminal or your assistant for details.");
        finish(err);
      },
    );
  });

  const timer = setTimeout(() => finish(new LinkedInMcpError("TIMEOUT", "Nobody approved the LinkedIn connection in time.", "Run connect-api again and approve it in the browser within 5 minutes.")), opts.timeoutMs ?? 5 * 60_000);
  timer.unref();

  function finish(err: unknown, token?: ApiToken) {
    clearTimeout(timer);
    server.close();
    if (token) settle.resolve(token);
    else settle.reject(err);
  }

  async function exchange(code: string): Promise<ApiToken> {
    const r = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri(app.redirectPort), client_id: app.clientId, client_secret: app.clientSecret }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw apiAuthError(`LinkedIn refused the token exchange (${r.status}): ${(await r.text()).slice(0, 300)}`);
    const tok = (await r.json()) as { access_token: string; expires_in?: number; scope?: string };
    const me = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(30_000) });
    if (!me.ok) throw apiAuthError(`Couldn't read your LinkedIn identity (${me.status}). Check the app has "Sign In with LinkedIn using OpenID Connect".`);
    const info = (await me.json()) as { sub: string; name?: string };
    const token: ApiToken = {
      access_token: tok.access_token,
      expires_at: now().getTime() + (tok.expires_in ?? 60 * 86_400) * 1000,
      author_urn: `urn:li:person:${info.sub}`,
      name: info.name ?? null,
      scope: tok.scope ?? null,
      connected_at: now().toISOString(),
    };
    await saveApiToken(paths, token);
    return token;
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", (err: NodeJS.ErrnoException) =>
      reject(
        err.code === "EADDRINUSE"
          ? new LinkedInMcpError(
              "INVALID_INPUT",
              `Port ${app.redirectPort} is already in use, so LinkedIn can't redirect back.`,
              `Close whatever uses it, or pick another port with LINKEDIN_MCP_API_REDIRECT_PORT and add http://localhost:<port>/callback to your app's redirect URLs.`,
            )
          : err,
      ),
    );
    server.listen(app.redirectPort, "127.0.0.1", () => resolve());
  });
  done.catch(() => undefined);
  return { url, done, cancel: () => finish(new LinkedInMcpError("USER_DECLINED", "Connecting was cancelled.", "Run connect-api again when you're ready.")) };
}

export function apiAuthError(message: string): LinkedInMcpError {
  return new LinkedInMcpError("NOT_LOGGED_IN", message, "Check the Client ID and Secret, and that the app's redirect URL matches, then run `npx @danishfareed/linkedin-mcp connect-api` again.");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Opens a URL in the user's default browser, without a shell. Failures are ignored: the URL is also printed. */
export function openInBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args as string[], { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // Printed URL is the fallback.
  }
}
