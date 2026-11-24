import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config.js";
import { type AppContext, createContext } from "../../src/context.js";
import { validateUpload } from "../../src/safety/files.js";
import { type ToolDef, isSendingTool, registerTools } from "../../src/tools/registry.js";
import { type VisualDeps, createVisualTools, visualTools } from "../../src/tools/visuals.js";
import { ImageJobs } from "../../src/visuals/generate.js";
import { closeRenderer, warmRenderer } from "../../src/visuals/render/browser.js";
import { tempDir } from "./helpers.js";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const KEY = "sk-test-visuals-0123456789";

function openaiFetch(gate?: Promise<void>): typeof fetch {
  return (async () => {
    await gate;
    return new Response(JSON.stringify({ created: 1, data: [{ b64_json: PNG_B64 }] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

async function connect(opts: { env?: NodeJS.ProcessEnv; fetch?: typeof fetch; readOnly?: boolean; toolTimeoutMs?: number } = {}) {
  const home = tempDir();
  const config = loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_WEB_FONTS: "false", ...(opts.readOnly ? { LINKEDIN_MCP_READ_ONLY: "true" } : {}) });
  if (opts.toolTimeoutMs) config.toolTimeoutMs = opts.toolTimeoutMs;
  const ctx: AppContext = createContext(config);
  const deps: VisualDeps = {
    generate: () => ({ fetch: opts.fetch ?? openaiFetch(), env: opts.env ?? { OPENAI_API_KEY: KEY }, now: () => new Date(2026, 10, 24, 10, 0, 0), random: () => 0, sleep: async () => undefined }),
    jobs: new ImageJobs(),
  };
  const server = new McpServer({ name: "visuals-test", version: "0.0.0" });
  registerTools(server, ctx, createVisualTools(deps) as unknown as ToolDef[]);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(b);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const text = res.content[0]!.text;
    let json: Record<string, any> = {};
    try {
      json = JSON.parse(text) as Record<string, any>;
    } catch {
      // The SDK reports schema violations as plain text before the handler runs.
    }
    return { isError: res.isError === true, text, json };
  };
  return { client, call, ctx, home };
}

describe("visual tools", () => {
  it("registers five tools, none of which can send anything to LinkedIn, even in read-only mode", async () => {
    expect(visualTools.map((t) => t.name)).toEqual(["generate_image", "create_quote_card", "create_carousel", "list_media", "image_providers"]);
    for (const t of visualTools) {
      expect(isSendingTool(t as unknown as ToolDef), t.name).toBe(false);
      expect(t.annotations.destructiveHint, t.name).toBe(false);
    }
    const { client } = await connect({ readOnly: true });
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(Object.keys(byName).sort()).toEqual(["create_carousel", "create_quote_card", "generate_image", "image_providers", "list_media"]);
    expect(byName.generate_image!.annotations).toMatchObject({ openWorldHint: true, readOnlyHint: false });
    expect(byName.generate_image!.description).toMatch(/own API key/);
    expect(byName.generate_image!.description).toMatch(/cost money/);
    expect(byName.create_carousel!.annotations).toMatchObject({ openWorldHint: false });
    expect(byName.list_media!.annotations).toMatchObject({ readOnlyHint: true });
    expect(byName.create_carousel!.inputSchema.properties).toHaveProperty("slides");
  });

  it("generates an image the post tools will accept, without ever echoing the key", async () => {
    const { call, home } = await connect();
    const res = await call("generate_image", { prompt: "A calm desk at sunrise", aspect_ratio: "4:5" });
    expect(res.isError).toBe(false);
    expect(res.text).not.toContain(KEY);
    expect(res.json).toMatchObject({ status: "done", provider: "OpenAI", model: "gpt-image-2.5-flare" });
    const path = res.json.images[0].path as string;
    expect(res.json.attach).toEqual({ images: [path] });
    expect(res.json.note).toMatch(/create_post or schedule_post/);
    expect(existsSync(path)).toBe(true);
    await expect(validateUpload(path, "image", home)).resolves.toMatchObject({ name: basename(path) });

    const listed = await call("list_media", { limit: 5 });
    expect(listed.json).toMatchObject({ total: 1, complete: true });
    expect(listed.json.files[0]).toMatchObject({ name: basename(path), kind: "image" });
  });

  it("asks for a prompt, and explains a missing provider", async () => {
    const empty = await connect();
    const noPrompt = await empty.call("generate_image", {});
    expect(noPrompt.isError).toBe(true);
    expect(noPrompt.json.error.code).toBe("INVALID_INPUT");

    const none = await connect({ env: {} });
    const res = await none.call("generate_image", { prompt: "x" });
    expect(res.isError).toBe(true);
    expect(res.json.error.message).toMatch(/No AI image provider/);
    expect(res.json.error.next_step).toMatch(/create_quote_card/);
  });

  it("returns a job_id while the provider is still working, then the result", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { call } = await connect({ fetch: openaiFetch(gate), toolTimeoutMs: 1_000 });
    const first = await call("generate_image", { prompt: "A slow one" });
    expect(first.json).toMatchObject({ status: "pending" });
    expect(first.json.job_id).toMatch(/^img_[0-9a-f]{12}$/);
    release();
    const second = await call("generate_image", { job_id: first.json.job_id });
    expect(second.json).toMatchObject({ status: "done" });
    expect(second.json.images).toHaveLength(1);
  });

  it("lists provider setup without exposing keys", async () => {
    const { call } = await connect({ env: { OPENAI_API_KEY: KEY } });
    const res = await call("image_providers");
    expect(res.text).not.toContain(KEY);
    expect(res.json.active).toBe("openai");
    expect(res.json.providers).toHaveLength(6);
    expect(res.json.providers.find((p: any) => p.provider === "ideogram")).toMatchObject({ configured: false, setup: expect.stringMatching(/IDEOGRAM_API_KEY/) });

    const none = await connect({ env: {} });
    expect((await none.call("image_providers")).json).toMatchObject({ active: "none", note: expect.stringMatching(/No provider is set up/) });
  });

  it("lists an empty media folder as complete", async () => {
    const { call, ctx } = await connect();
    expect((await call("list_media")).json).toMatchObject({ folder: ctx.config.paths.mediaDir, files: [], total: 0, complete: true });
  });
});

const browserAvailable = await warmRenderer(loadConfig({ LINKEDIN_MCP_HOME: tempDir() }));

describe.skipIf(!browserAvailable)("visual tools that render", { timeout: 60_000 }, () => {
  afterAll(async () => {
    await closeRenderer();
  });

  it("creates a quote card and a carousel ready to attach", async () => {
    const { call, ctx } = await connect();
    await ctx.account.update({ name: "Grace Hopper" });
    const card = await call("create_quote_card", { quote: "A ship in port is safe, but that's not what ships are built for.", theme: "midnight" });
    expect(card.isError).toBe(false);
    expect(card.json).toMatchObject({ width: 1080, height: 1350, theme: "midnight", attach: { images: [card.json.path] } });

    const deck = await call("create_carousel", {
      title: "Three habits",
      slides: [{ heading: "One" }, { heading: "Two", bullets: ["a", "b"] }, { heading: "Three", big_number: "3x" }],
      preview_count: 1,
    });
    expect(deck.isError).toBe(false);
    expect(deck.json).toMatchObject({ pages: 5, document: { path: deck.json.pdf, title: "Three habits" } });
    expect(deck.json.previews).toHaveLength(1);
    expect(deck.json.pdf.startsWith(join(ctx.config.paths.mediaDir, "2026-"))).toBe(true);

    const tooFew = await call("create_carousel", { title: "x", slides: [{ heading: "only one" }] });
    expect(tooFew.isError).toBe(true);
    expect(tooFew.text).toMatch(/slides/);
  });
});
