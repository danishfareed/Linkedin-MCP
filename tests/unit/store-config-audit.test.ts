import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, parseWorkingHours, patchFileConfig, resolvePaths } from "../../src/config.js";
import { AuditLog, hashText } from "../../src/safety/audit.js";
import { readJson, updateJson, writeJsonAtomic } from "../../src/state/store.js";
import { tempDir } from "./helpers.js";

describe("store", () => {
  it("returns the fallback for a missing file and round-trips JSON", async () => {
    const file = join(tempDir(), "a", "b.json");
    expect(await readJson(file, { n: 0 })).toEqual({ n: 0 });
    await writeJsonAtomic(file, { n: 1 });
    expect(await readJson(file, { n: 0 })).toEqual({ n: 1 });
  });

  it("moves a corrupt file aside instead of overwriting it", async () => {
    const dir = tempDir();
    const file = join(dir, "x.json");
    writeFileSync(file, "{not json");
    expect(await readJson(file, { ok: true })).toEqual({ ok: true });
    expect(readdirSync(dir).some((f) => f.startsWith("x.json.corrupt-"))).toBe(true);
  });

  it("serialises concurrent updates", async () => {
    const file = join(tempDir(), "count.json");
    await Promise.all(Array.from({ length: 30 }, () => updateJson(file, { n: 0 }, (c) => ({ n: c.n + 1 }))));
    expect(await readJson(file, { n: 0 })).toEqual({ n: 30 });
  });
});

describe("config", () => {
  it("uses defaults when nothing is set", () => {
    const home = tempDir();
    const cfg = loadConfig({ LINKEDIN_MCP_HOME: home });
    expect(cfg.headless).toBe(true);
    expect(cfg.dryRun).toBe(false);
    expect(cfg.idleTimeoutMs).toBe(10 * 60_000);
    expect(cfg.workingHours).toEqual({ start: "08:00", end: "21:00" });
    expect(cfg.confirmReactions).toBe(true);
    expect(cfg.paths.profile).toBe(join(home, "profile"));
  });

  it("lets env vars win over config.json", () => {
    const home = tempDir();
    writeFileSync(join(home, "config.json"), JSON.stringify({ headless: false, dryRun: false, workingHours: "off" }));
    const cfg = loadConfig({ LINKEDIN_MCP_HOME: home, LINKEDIN_MCP_DRY_RUN: "true", LINKEDIN_MCP_WORKING_HOURS: "9:30-18:00" });
    expect(cfg.headless).toBe(false);
    expect(cfg.dryRun).toBe(true);
    expect(cfg.workingHours).toEqual({ start: "09:30", end: "18:00" });
  });

  it("rejects invalid config.json with a clear message", () => {
    const home = tempDir();
    writeFileSync(join(home, "config.json"), JSON.stringify({ idleTimeoutMinutes: -1 }));
    expect(() => loadConfig({ LINKEDIN_MCP_HOME: home })).toThrow(/invalid settings/);
  });

  it("parses working hours", () => {
    expect(parseWorkingHours("off")).toBe("off");
    expect(parseWorkingHours("07:00-22:00")).toEqual({ start: "07:00", end: "22:00" });
    expect(() => parseWorkingHours("7am-10pm")).toThrow();
  });

  it("patches config.json without losing other keys", async () => {
    const home = tempDir();
    const paths = resolvePaths({ LINKEDIN_MCP_HOME: home });
    writeFileSync(paths.configFile, JSON.stringify({ headless: false }));
    await patchFileConfig(paths, (c) => ({ ...c, limits: { ...c.limits, post: 1 } }));
    expect(JSON.parse(readFileSync(paths.configFile, "utf8"))).toEqual({ headless: false, limits: { post: 1 } });
  });
});

describe("AuditLog", () => {
  it("appends records and returns the most recent first, without the text", async () => {
    const log = new AuditLog(join(tempDir(), "audit.jsonl"));
    await log.record({ tool: "create_post", target: null, text_hash: hashText("hello"), result: "success" });
    await log.record({ tool: "comment_on_post", target: "https://www.linkedin.com/feed/update/urn:li:activity:1/", text_hash: hashText("nice"), result: "dry_run" });
    const recent = await log.recent(10);
    expect(recent.map((r) => r.tool)).toEqual(["comment_on_post", "create_post"]);
    expect(JSON.stringify(recent)).not.toContain("hello");
    expect(recent[1]!.text_hash).toHaveLength(16);
  });
});

describe("default data folder", () => {
  it("avoids ~/.linkedin-mcp and follows platform conventions", async () => {
    const { defaultHome } = await import("../../src/config.js");
    expect(defaultHome({ XDG_CONFIG_HOME: "/x/cfg" }, "linux")).toBe(join("/x/cfg", "linkedin-mcp"));
    expect(defaultHome({}, "darwin")).toMatch(/\.config[\\/]linkedin-mcp$/);
    expect(defaultHome({ LOCALAPPDATA: "C:\\Users\\a\\AppData\\Local" }, "win32")).toBe(join("C:\\Users\\a\\AppData\\Local", "linkedin-mcp"));
    expect(defaultHome({}, "darwin")).not.toMatch(/\.linkedin-mcp/);
  });
});
