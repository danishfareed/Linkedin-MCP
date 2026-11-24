import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { AppContext } from "../../src/context.js";
import { PLAYBOOK, PLAYBOOK_INDEX_URI, registerPlaybook, topicUri } from "../../src/growth/playbook/index.js";
import { GROWTH_PROMPTS, PROMPT_TOOLS, PROMPT_TOPICS } from "../../src/growth/prompts.js";
import { ALL_TOOLS } from "../../src/server.js";
import { playbookTools } from "../../src/tools/playbook.js";
import { type ToolDef, registerTools } from "../../src/tools/registry.js";

/** Tools other modules are building; every other name a prompt uses must already exist. */
const UPCOMING = ["get_playbook", "growth_profile", "growth_strategy", "growth_ideas", "growth_calendar", "review_post", "growth_report", "generate_image", "create_quote_card", "create_carousel"];

const PROMPT_NAMES = ["start_growth_strategy", "plan_my_week", "write_post", "engagement_session", "profile_audit", "monthly_growth_review", "repurpose_post", "reply_to_comments"];

async function connect() {
  const server = new McpServer({ name: "playbook-test", version: "0.0.0" });
  registerPlaybook(server);
  const ctx = { config: { readOnly: false } } as unknown as AppContext;
  registerTools(server, ctx, playbookTools as unknown as ToolDef[]);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  return client;
}

function promptText(r: { messages: { content: unknown }[] }): string {
  const c = r.messages[0]!.content as { type: string; text: string };
  expect(c.type).toBe("text");
  return c.text;
}

describe("playbook resources", () => {
  it("lists an index and one markdown resource per topic", async () => {
    const client = await connect();
    const { resources } = await client.listResources();
    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual([PLAYBOOK_INDEX_URI, ...PLAYBOOK.map((t) => topicUri(t.id))].sort());
    for (const r of resources) expect(r.mimeType).toBe("text/markdown");
  });

  it("serves each topic as markdown with its title", async () => {
    const client = await connect();
    for (const t of PLAYBOOK) {
      const r = await client.readResource({ uri: topicUri(t.id) });
      const content = r.contents[0] as { uri: string; mimeType: string; text: string };
      expect(content.uri).toBe(topicUri(t.id));
      expect(content.mimeType).toBe("text/markdown");
      expect(content.text.startsWith(`# ${t.title}\n`)).toBe(true);
      expect(content.text).toContain(t.body.trim().slice(0, 80));
    }
    const index = await client.readResource({ uri: PLAYBOOK_INDEX_URI });
    const text = (index.contents[0] as { text: string }).text;
    for (const t of PLAYBOOK) expect(text).toContain(topicUri(t.id));
  });
});

describe("growth prompts", () => {
  it("registers the eight prompts with optional string arguments", async () => {
    const client = await connect();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual([...PROMPT_NAMES].sort());
    for (const p of prompts) {
      expect(p.description?.length).toBeGreaterThan(20);
      expect(p.arguments?.length).toBeGreaterThan(0);
      for (const a of p.arguments ?? []) expect(a.required).toBeFalsy();
    }
    expect(prompts.find((p) => p.name === "write_post")!.arguments!.map((a) => a.name)).toEqual(["idea", "format", "pillar"]);
  });

  it("renders every prompt with and without arguments, always carrying the safety rules", async () => {
    const client = await connect();
    for (const p of GROWTH_PROMPTS) {
      const bare = promptText(await client.getPrompt({ name: p.name, arguments: {} }));
      expect(bare).not.toContain("What the user has told you already");
      for (const rule of ["confirm_action", "word for word", "get_limits", "LIMIT_REACHED", "CHECKPOINT", "Never invent facts", "engagement pods"]) {
        expect(bare, `${p.name} lacks "${rule}"`).toContain(rule);
      }
      const args = Object.fromEntries(Object.keys(p.args).map((k) => [k, `sample ${k}`]));
      const filled = promptText(await client.getPrompt({ name: p.name, arguments: args }));
      for (const k of Object.keys(p.args)) expect(filled).toContain(`sample ${k}`);
    }
  });

  it("makes write_post go idea → method → hooks → draft → review_post", async () => {
    const client = await connect();
    const text = promptText(await client.getPrompt({ name: "write_post", arguments: { idea: "Why we stopped offering a free plan" } }));
    expect(text).toContain("- Idea: Why we stopped offering a free plan");
    const order = ["Idea:", "Method:", "Hooks:", "Draft:", "Self-review:", "Publish only if the user asks"].map((s) => text.indexOf(s));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("`review_post`");
  });

  it("uses the profile and analytics tools where the task needs them", async () => {
    const client = await connect();
    expect(promptText(await client.getPrompt({ name: "profile_audit", arguments: {} }))).toContain("`get_my_profile`");
    const review = promptText(await client.getPrompt({ name: "monthly_growth_review", arguments: {} }));
    for (const tool of ["get_my_posts", "get_post_analytics", "get_profile_analytics", "growth_report"]) expect(review).toContain(`\`${tool}\``);
  });

  it("only names tools that exist or are being built, and only real playbook topics", () => {
    const existing = new Set(ALL_TOOLS.map((t) => t.name));
    for (const name of PROMPT_TOOLS) {
      if (!UPCOMING.includes(name)) expect(existing.has(name), `${name} is not a server tool`).toBe(true);
    }
    const ids = PLAYBOOK.map((t) => t.id);
    expect([...PROMPT_TOPICS].sort()).toEqual([...ids].sort());
    for (const p of GROWTH_PROMPTS) {
      const text = p.render({});
      for (const m of text.matchAll(/`([a-z]+(?:_[a-z]+)+)`/g)) expect(PROMPT_TOOLS as readonly string[], `${p.name}: ${m[1]}`).toContain(m[1]);
      for (const m of text.matchAll(/with topic "([^"]+)"/g)) expect(ids, `${p.name}: ${m[1]}`).toContain(m[1]);
    }
  });
});

describe("get_playbook over MCP", () => {
  it("returns a topic through a real client call", async () => {
    const client = await connect();
    const r = (await client.callTool({ name: "get_playbook", arguments: { topic: "post-formats" } })) as { isError?: boolean; content: { text: string }[] };
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content[0]!.text) as { id: string; markdown: string };
    expect(body.id).toBe("post-formats");
    expect(body.markdown).toContain("### 12. Carousel or document post");
  });
});
