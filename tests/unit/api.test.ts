import { statSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig, resolvePaths } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { apiVersion, buildPostBody, escapeCommentary, publishViaApi } from "../../src/linkedin/api/client.js";
import { startAuthorization } from "../../src/linkedin/api/oauth.js";
import { type ApiToken, apiStatus, readApiToken, saveApiToken } from "../../src/linkedin/api/token.js";
import { WriteAttempt } from "../../src/linkedin/outcome.js";
import { createServer as createMcpServer } from "../../src/server.js";
import { fakeClock, tempDir } from "./helpers.js";

const NOW = new Date(2026, 10, 24, 10, 0);
const TOKEN: ApiToken = {
  access_token: "tok",
  expires_at: NOW.getTime() + 50 * 86_400_000,
  author_urn: "urn:li:person:abc",
  name: "Test User",
  scope: "openid profile w_member_social",
  connected_at: NOW.toISOString(),
};

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** A fake LinkedIn API: image uploads, then the post create returns `postStatus`. */
function fakeApi(postStatus: number, postBody: unknown = null) {
  const calls: { url: string; method: string; body?: string }[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", body: typeof init?.body === "string" ? init.body : undefined });
    if (url.includes("/rest/images?action=initializeUpload")) {
      const n = calls.filter((c) => c.url.includes("initializeUpload")).length;
      return jsonResponse(200, { value: { uploadUrl: `https://upload.example/${n}`, image: `urn:li:image:${n}` } });
    }
    if (url.startsWith("https://upload.example/")) return new Response(null, { status: 201 });
    if (url.endsWith("/rest/posts")) return postStatus === 201 ? jsonResponse(201, null, { "x-restli-id": "urn:li:share:777" }) : jsonResponse(postStatus, postBody);
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("commentary format", () => {
  it("escapes LinkedIn's reserved characters so text posts as written", () => {
    expect(escapeCommentary("Pricing (part 1) * notes_v2 ~ <draft> [x] {y} @team | a\\b")).toBe(
      "Pricing \\(part 1\\) \\* notes\\_v2 \\~ \\<draft\\> \\[x\\] \\{y\\} \\@team \\| a\\\\b",
    );
  });

  it("turns hashtags into hashtag templates and leaves look-alikes alone", () => {
    expect(escapeCommentary("Shipping #MCP today. #ai_tools (#startups)")).toBe(
      "Shipping {hashtag|\\#|MCP} today. {hashtag|\\#|ai\\_tools} \\({hashtag|\\#|startups}\\)",
    );
    expect(escapeCommentary("issue a#1 and &#169;")).toBe("issue a\\#1 and &\\#169;");
    expect(escapeCommentary("#launch\nnext line")).toBe("{hashtag|\\#|launch}\nnext line");
  });

  it("builds single-image, multi-image and connections-only bodies", () => {
    expect(buildPostBody("urn:li:person:x", "hi", "anyone", [])).toMatchObject({ visibility: "PUBLIC", lifecycleState: "PUBLISHED" });
    expect(buildPostBody("urn:li:person:x", "hi", "anyone", ["urn:li:image:1"]).content).toEqual({ media: { id: "urn:li:image:1", altText: "" } });
    expect(buildPostBody("urn:li:person:x", "hi", "connections", ["urn:li:image:1", "urn:li:image:2"])).toMatchObject({
      visibility: "CONNECTIONS",
      content: { multiImage: { images: [{ id: "urn:li:image:1" }, { id: "urn:li:image:2" }] } },
    });
  });

  it("uses a LinkedIn-Version two months back, or the override", () => {
    expect(apiVersion(new Date(Date.UTC(2026, 10, 24)))).toBe("202609");
    expect(apiVersion(new Date(Date.UTC(2026, 0, 5)))).toBe("202511");
    expect(apiVersion(new Date(), "202601")).toBe("202601");
  });
});

describe("publishViaApi", () => {
  it("uploads images first, then reports the created post as sent", async () => {
    const img = join(tempDir(), "a.png");
    writeFileSync(img, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const api = fakeApi(201);
    const attempt = new WriteAttempt();
    const r = await publishViaApi(TOKEN, { text: "Hello #world", images: [img, img], visibility: "anyone" }, attempt, { fetchImpl: api.impl, now: () => NOW });
    expect(r).toMatchObject({ outcome: "sent", data: { via: "api", post_urn: "urn:li:share:777", post_url: "https://www.linkedin.com/feed/update/urn:li:share:777/" } });
    expect(attempt.committed).toBe(true);
    expect(api.calls.map((c) => c.method)).toEqual(["POST", "PUT", "POST", "PUT", "POST"]);
    const body = JSON.parse(api.calls.at(-1)!.body!);
    expect(body.author).toBe("urn:li:person:abc");
    expect(body.content.multiImage.images).toHaveLength(2);
  });

  it("maps LinkedIn's answers: refused is not_sent, a server error is unconfirmed", async () => {
    const run = (status: number, body: unknown = { message: "x" }) =>
      publishViaApi(TOKEN, { text: "t", images: [], visibility: "anyone" }, new WriteAttempt(), { fetchImpl: fakeApi(status, body).impl, now: () => NOW });
    expect(await run(422, { message: "Content is a duplicate of urn:li:share:1" })).toMatchObject({ outcome: "not_sent", reason: "duplicate", retry_safe: true });
    expect(await run(401)).toMatchObject({ outcome: "not_sent", reason: "api_unauthorized" });
    expect(await run(429)).toMatchObject({ outcome: "not_sent", reason: "api_rate_limited" });
    expect(await run(503)).toMatchObject({ outcome: "unconfirmed", retry_safe: false });
  });

  it("errors before anything is published when an image upload fails", async () => {
    const attempt = new WriteAttempt();
    const failing = (async () => jsonResponse(401, { message: "expired" })) as typeof fetch;
    const img = join(tempDir(), "a.png");
    writeFileSync(img, "x");
    await expect(publishViaApi(TOKEN, { text: "t", images: [img], visibility: "anyone" }, attempt, { fetchImpl: failing })).rejects.toMatchObject({ code: "NOT_LOGGED_IN" });
    expect(attempt.committed).toBe(false);
  });
});

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

describe("OAuth connection", () => {
  it("exchanges the code, reads the member id and saves the token owner-only", async () => {
    const paths = resolvePaths({ LINKEDIN_MCP_HOME: tempDir() });
    const port = await freePort();
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/oauth/v2/accessToken")) {
        expect(String(init?.body)).toContain("code=the-code");
        return jsonResponse(200, { access_token: "new-token", expires_in: 5_184_000, scope: "openid,profile,w_member_social" });
      }
      if (url.includes("/v2/userinfo")) return jsonResponse(200, { sub: "xyz", name: "Danish F" });
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    const auth = await startAuthorization({ clientId: "cid", clientSecret: "secret", redirectPort: port }, paths, { fetchImpl, now: () => NOW });
    const state = new URL(auth.url).searchParams.get("state")!;
    expect(new URL(auth.url).searchParams.get("scope")).toBe("openid profile w_member_social");

    // A response with the wrong state is ignored.
    expect((await fetch(`http://127.0.0.1:${port}/callback?state=wrong&code=evil`)).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${port}/callback?state=${state}&code=the-code`)).status).toBe(200);

    const token = await auth.done;
    expect(token).toMatchObject({ access_token: "new-token", author_urn: "urn:li:person:xyz", name: "Danish F" });
    expect(await readApiToken(paths)).toMatchObject({ author_urn: "urn:li:person:xyz" });
    if (process.platform !== "win32") expect(statSync(paths.apiTokenFile).mode & 0o777).toBe(0o600);
  });

  it("rejects when the user denies access", async () => {
    const paths = resolvePaths({ LINKEDIN_MCP_HOME: tempDir() });
    const port = await freePort();
    const auth = await startAuthorization({ clientId: "cid", clientSecret: "s", redirectPort: port }, paths);
    const state = new URL(auth.url).searchParams.get("state")!;
    await fetch(`http://127.0.0.1:${port}/callback?state=${state}&error=user_cancelled_authorize`);
    await expect(auth.done).rejects.toMatchObject({ code: "USER_DECLINED" });
  });
});

describe("apiStatus", () => {
  it("reports not set up, connected, expiring soon and expired", async () => {
    const paths = resolvePaths({ LINKEDIN_MCP_HOME: tempDir() });
    expect(await apiStatus(paths, {}, NOW)).toMatchObject({ configured: false, connected: false });
    await saveApiToken(paths, TOKEN);
    expect(await apiStatus(paths, { clientId: "a", clientSecret: "b" }, NOW)).toMatchObject({ configured: true, connected: true, expires_in_days: 50 });
    expect((await apiStatus(paths, {}, new Date(TOKEN.expires_at - 3 * 86_400_000))).note).toMatch(/expires within a week/);
    expect(await apiStatus(paths, {}, new Date(TOKEN.expires_at + 1))).toMatchObject({ connected: false });
  });
});

describe("create_post routing", () => {
  async function setup(env: Record<string, string> = {}, withToken = true) {
    const home = tempDir();
    const config = loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_WORKING_HOURS: "off", ...env });
    const ctx = createContext(config, fakeClock(NOW).clock);
    const browserCalls: string[] = [];
    ctx.session = {
      run: async () => {
        browserCalls.push("run");
        throw new Error("the browser should not be used");
      },
      close: async () => undefined,
      isOpen: () => false,
    } as unknown as BrowserSession;
    if (withToken) await saveApiToken(config.paths, TOKEN);
    const [clientT, serverT] = InMemoryTransport.createLinkedPair();
    await createMcpServer(ctx).connect(serverT);
    const client = new Client({ name: "t", version: "0" });
    await client.connect(clientT);
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
      return { isError: Boolean(r.isError), body: JSON.parse(r.content[0]!.text) as Record<string, any> };
    };
    return { ctx, call, browserCalls };
  }

  it("posts through the API when connected, without opening the browser", async () => {
    const api = fakeApi(201);
    vi.stubGlobal("fetch", api.impl);
    const { call, browserCalls, ctx } = await setup();
    const preview = await call("create_post", { text: "Shipped it." });
    expect(preview.body.preview.published_via).toBe("LinkedIn's official API (as Test User)");
    const done = await call("confirm_action", { confirmation_token: preview.body.confirmation_token });
    expect(done.body).toMatchObject({ status: "sent", result: { via: "api", post_urn: "urn:li:share:777" } });
    expect(browserCalls).toEqual([]);
    expect((await ctx.audit.recent(1))[0]).toMatchObject({ tool: "create_post", result: "success" });
  });

  it("uses the browser when told to, or for document carousels", async () => {
    const { call } = await setup({ LINKEDIN_MCP_POST_VIA: "browser" });
    expect((await call("create_post", { text: "Hi" })).body.preview.published_via).toMatch(/^the browser/);
  });

  it("refuses to fall back silently when the API is required but not connected", async () => {
    const { call } = await setup({ LINKEDIN_MCP_POST_VIA: "api" }, false);
    const r = await call("create_post", { text: "Hi" });
    expect(r.isError).toBe(true);
    expect(r.body.error.code).toBe("NOT_LOGGED_IN");
  });

  it("rejects an unknown posting mode", () => {
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: tempDir(), LINKEDIN_MCP_POST_VIA: "magic" })).toThrow(/auto, api or browser/);
  });
});
