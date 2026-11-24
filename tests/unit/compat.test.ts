import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { TOOLSET_GROUPS, TOOLSET_PRESETS, loadConfig, parseToolsets } from "../../src/config.js";
import { createContext } from "../../src/context.js";
import { ALL_TOOLS, TOOLSET_OF, createServer, toolsFor } from "../../src/server.js";
import { describeTools, portableSchema } from "../../src/tools/registry.js";
import { tempDir } from "./helpers.js";

/** Keywords accepted by every major client's tool-schema handling (Gemini's function calling is the strictest). */
const PORTABLE = new Set(["type", "description", "properties", "required", "items", "enum", "default", "nullable", "anyOf", "minimum", "maximum", "minLength", "maxLength", "pattern", "minItems", "maxItems", "title", "format"]);

function keywordsIn(schema: unknown, found = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) schema.forEach((s) => keywordsIn(s, found));
  else if (schema && typeof schema === "object") {
    for (const [k, v] of Object.entries(schema)) {
      if (k === "properties") Object.values(v as object).forEach((p) => keywordsIn(p, found));
      else if (k === "enum" || k === "default" || k === "required") found.add(k);
      else {
        found.add(k);
        keywordsIn(v, found);
      }
    }
  }
  return found;
}

async function listed(env: Record<string, string> = {}) {
  const ctx = createContext(loadConfig({ LINKEDIN_MCP_HOME: tempDir(), ...env }));
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer(ctx).connect(b);
  const client = new Client({ name: "compat", version: "0" });
  await client.connect(a);
  return { client, tools: (await client.listTools()).tools };
}

describe("works with every MCP client", () => {
  it("puts every tool in exactly one toolset", () => {
    const names = ALL_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((n) => !(n in TOOLSET_OF))).toEqual([]);
    expect(Object.keys(TOOLSET_OF).filter((n) => !names.includes(n))).toEqual([]);
  });

  it("uses tool names every client accepts", () => {
    for (const t of ALL_TOOLS) expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
  });

  it("advertises only portable JSON Schema keywords", async () => {
    const { tools } = await listed();
    expect(tools).toHaveLength(ALL_TOOLS.length);
    for (const t of tools) {
      const unsupported = [...keywordsIn(t.inputSchema)].filter((k) => !PORTABLE.has(k));
      expect({ tool: t.name, unsupported }).toEqual({ tool: t.name, unsupported: [] });
      expect(t.inputSchema.type).toBe("object");
      expect(t.inputSchema.properties).toBeDefined();
    }
  });

  it("keeps descriptions within common client limits", () => {
    for (const t of describeTools(ALL_TOOLS)) {
      expect(t.description!.length, t.name).toBeLessThanOrEqual(1024);
      expect(t.description!.length, t.name).toBeGreaterThan(20);
    }
  });

  it("rewrites keywords some clients reject", () => {
    expect(
      portableSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
        properties: { n: { type: "integer", exclusiveMinimum: 0 }, k: { const: "x" }, d: { type: "string", format: "date" }, t: { type: "string", format: "date-time" } },
      }),
    ).toEqual({
      type: "object",
      properties: { n: { type: "integer", minimum: 1 }, k: { enum: ["x"] }, d: { type: "string" }, t: { type: "string", format: "date-time" } },
    });
  });

  it("still validates strictly on the server", async () => {
    const { client } = await listed();
    const r = (await client.callTool({ name: "growth_profile", arguments: { action: "update", patch: { not_a_field: 1 } } })) as { isError?: boolean };
    expect(r.isError).toBe(true);
  });
});

describe("toolsets", () => {
  const count = (spec: string) => toolsFor(parseToolsets(spec)).length;

  it("has presets sized for clients with tool limits", () => {
    expect(count("all")).toBe(53);
    expect(count("creator")).toBe(38);
    expect(count("outreach")).toBe(27);
    expect(count("lite")).toBe(26);
    expect(count("lite,growth")).toBe(33);
    expect(Object.keys(TOOLSET_PRESETS)).toEqual(["all", "creator", "outreach", "lite"]);
  });

  it("always includes core and rejects unknown names", () => {
    expect(parseToolsets("visuals")).toEqual(["core", "visuals"]);
    expect(parseToolsets(undefined)).toEqual([...TOOLSET_GROUPS]);
    expect(() => parseToolsets("creator,magic")).toThrow(/Unknown toolset "magic"/);
  });

  it("serves only the chosen groups", async () => {
    const { tools } = await listed({ LINKEDIN_MCP_TOOLSETS: "lite" });
    const names = tools.map((t) => t.name);
    expect(names).toHaveLength(26);
    expect(names).toContain("confirm_action");
    expect(names).toContain("create_post");
    expect(names).not.toContain("growth_report");
    expect(names).not.toContain("search_jobs");
  });
});
