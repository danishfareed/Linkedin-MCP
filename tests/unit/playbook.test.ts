import { describe, expect, it } from "vitest";
import type { AppContext } from "../../src/context.js";
import { PLAYBOOK, findTopic, playbookIndex, renderTopic, searchPlaybook, splitSections, wordCount } from "../../src/growth/playbook/index.js";
import { tokenize } from "../../src/growth/playbook/search.js";
import { readPlaybook, playbookTools } from "../../src/tools/playbook.js";
import { LOCAL, invoke } from "../../src/tools/registry.js";

const REQUIRED_TOPICS = ["algorithm", "psychology", "hooks", "post-formats", "content-strategy", "profile", "engagement", "writing", "measurement", "personas", "ethics"];

function topic(id: string) {
  const t = PLAYBOOK.find((x) => x.id === id);
  if (!t) throw new Error(`missing topic ${id}`);
  return t;
}

describe("playbook content", () => {
  it("has every required topic once, with kebab-case ids and a title, summary and body", () => {
    const ids = PLAYBOOK.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(REQUIRED_TOPICS));
    for (const t of PLAYBOOK) {
      expect(t.id).toMatch(/^[a-z]+(-[a-z]+)*$/);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.summary.length).toBeGreaterThan(40);
      expect(t.body.trimStart().startsWith("## ")).toBe(true); // the title is added when served, so no H1 in the body
      expect(splitSections(t).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("is substantial: roughly 15–30k words in total", () => {
    const total = PLAYBOOK.reduce((sum, t) => sum + wordCount(t.body), 0);
    expect(total).toBeGreaterThan(15_000);
    expect(total).toBeLessThan(30_000);
  });

  it("cites sources as well-formed https markdown links in every topic", () => {
    for (const t of PLAYBOOK) {
      const links = [...t.body.matchAll(/\]\(([^)\s]+(?:\([^)\s]*\)[^)\s]*)*)\)/g)].map((m) => m[1]!);
      expect(links.length, t.id).toBeGreaterThan(2);
      for (const url of links) expect(url, `${t.id}: ${url}`).toMatch(/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}\//i);
    }
  });

  it("labels evidence levels in the algorithm topic", () => {
    const body = topic("algorithm").body;
    for (const label of ["[Official]", "[Data]", "[Practitioner]", "[Uncertain]"]) expect(body).toContain(label);
    for (const subject of ["Dwell time", "External links", "Hashtags", "Posting frequency", "Editing", "Tagging", "golden hour", "Poll", "Video", "Newsletter", "Saves and sends"]) {
      expect(body.toLowerCase()).toContain(subject.toLowerCase());
    }
  });

  it("has at least 40 example hooks and covers the see-more fold", () => {
    const body = topic("hooks").body;
    const examples = body.split("\n").filter((l) => l.startsWith('- "'));
    expect(examples.length).toBeGreaterThanOrEqual(40);
    expect(new Set(examples).size).toBe(examples.length);
    expect(body).toMatch(/210 characters/);
  });

  it("has at least 25 post formats, each with all six parts", () => {
    const entries = splitSections(topic("post-formats")).filter((s) => /› \d+\./.test(s.heading));
    expect(entries.length).toBeGreaterThanOrEqual(25);
    for (const e of entries) {
      for (const part of ["**How it works:**", "**Why it works:**", "**Best stage:**", "**Evidence it needs:**", "**Risks:**", "**Example outline:**"]) {
        expect(e.text, `${e.heading} is missing ${part}`).toContain(part);
      }
    }
  });

  it("states that pods and automated engagement break LinkedIn's policies", () => {
    expect(topic("engagement").body).toMatch(/Engagement pods and automated engagement violate LinkedIn's policies/);
    expect(topic("ethics").body).toMatch(/professional-community-policies/);
  });

  it("covers the five personas", () => {
    const headings = splitSections(topic("personas")).map((s) => s.heading);
    for (const p of ["Founders and CEOs", "B2B sales professionals", "Job seekers", "Consultants and agency owners", "Creators"]) expect(headings).toContain(p);
  });
});

describe("playbook lookup and search", () => {
  it("finds topics by id, title, alias and unique prefix, ignoring case", () => {
    expect(findTopic("hooks")?.id).toBe("hooks");
    expect(findTopic("HOOKS")?.id).toBe("hooks");
    expect(findTopic("Content Strategy")?.id).toBe("content-strategy");
    expect(findTopic("content_strategy")?.id).toBe("content-strategy");
    expect(findTopic("formats")?.id).toBe("post-formats");
    expect(findTopic("psych")?.id).toBe("psychology");
    expect(findTopic("p")).toBeUndefined(); // ambiguous prefix
    expect(findTopic("nonsense")).toBeUndefined();
    expect(findTopic("   ")).toBeUndefined();
  });

  it("stems and drops stopwords when tokenizing", () => {
    expect(tokenize("How do I write better hooks?")).toEqual(["write", "better", "hook"]);
  });

  it.each([
    ["carousel slides", "post-formats"],
    ["headline formula", "profile"],
    ["engagement pods", "engagement"],
    ["golden hour", "algorithm"],
    ["sign test small sample", "measurement"],
    ["lead magnet", "content-strategy"],
    ["AI writing tells", "writing"],
    ["curiosity gap", "hooks"],
    ["job seeker open to work", "personas"],
    ["link in first comment", "algorithm"],
    ["how often should I post", "algorithm"],
  ])("ranks the right topic first for %j", (query, expected) => {
    const hits = searchPlaybook(query);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.topic).toBe(expected);
  });

  it("limits results and can search within one topic", () => {
    expect(searchPlaybook("post", { limit: 3 })).toHaveLength(3);
    const inTopic = searchPlaybook("comment", { topic: "hooks" });
    expect(inTopic.length).toBeGreaterThan(0);
    expect(inTopic.every((h) => h.topic === "hooks")).toBe(true);
    expect(searchPlaybook("the and of")).toEqual([]);
  });
});

describe("get_playbook", () => {
  it("returns the index with no arguments", () => {
    const r = readPlaybook({});
    expect((r.topics as unknown[]).length).toBe(PLAYBOOK.length);
    expect(r.topics).toEqual(playbookIndex());
    expect(playbookIndex()[0]!.uri).toBe(`linkedin-mcp://playbook/${PLAYBOOK[0]!.id}`);
  });

  it("returns a whole topic as markdown", () => {
    const r = readPlaybook({ topic: "Hooks" });
    expect(r.id).toBe("hooks");
    expect(r.markdown).toBe(renderTopic(topic("hooks")));
    expect(String(r.markdown).startsWith("# Hooks and the first lines")).toBe(true);
  });

  it("rejects an unknown topic and lists the valid ones", () => {
    expect(() => readPlaybook({ topic: "growth hacks" })).toThrow(/no playbook topic "growth hacks".*algorithm/);
  });

  it("returns at most five sections for a query, scoped to a topic when both are given", () => {
    const all = readPlaybook({ query: "document carousel reach" });
    const results = all.results as { topic: string; section: string; text: string; uri: string }[];
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results[0]!.text.length).toBeGreaterThan(50);
    expect(results[0]!.uri).toMatch(/^linkedin-mcp:\/\/playbook\//);

    const scoped = readPlaybook({ topic: "algorithm", query: "document carousel reach" });
    expect((scoped.results as { topic: string }[]).every((h) => h.topic === "algorithm")).toBe(true);
  });

  it("explains when nothing matches", () => {
    const r = readPlaybook({ query: "zzzqqq xylophone" });
    expect(r.results).toEqual([]);
    expect(r.note).toMatch(/No section matched/);
    expect(readPlaybook({ topic: "hooks", query: "zzzqqq" }).note).toMatch(/Nothing in "hooks" matched/);
  });

  it("is a local tool that runs through the registry", async () => {
    const tool = playbookTools[0]!;
    expect(tool.name).toBe("get_playbook");
    expect(tool.annotations).toBe(LOCAL);
    const ctx = { config: { readOnly: true } } as unknown as AppContext; // still available in read-only mode
    const ok = await invoke(tool, { topic: "ethics" }, ctx);
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse((ok.content[0] as { text: string }).text).id).toBe("ethics");
    const bad = await invoke(tool, { topic: "nope" }, ctx);
    expect(bad.isError).toBe(true);
    expect(JSON.parse((bad.content[0] as { text: string }).text).error.code).toBe("INVALID_INPUT");
  });
});
