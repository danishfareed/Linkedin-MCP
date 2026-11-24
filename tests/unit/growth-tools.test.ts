import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { BrowserSession } from "../../src/browser/session.js";
import { loadConfig } from "../../src/config.js";
import { type AppContext, createContext } from "../../src/context.js";
import { LinkedInMcpError, selectorBroken } from "../../src/errors.js";
import { addSlots } from "../../src/growth/workspace/calendar.js";
import { growthFiles } from "../../src/growth/workspace/files.js";
import { POST_METRICS, PROFILE_METRICS, readMetrics } from "../../src/linkedin/parse/analytics.js";
import { parsePosts } from "../../src/linkedin/parse/feed.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";
import { type LinkedInReader, makeGrowthTools } from "../../src/tools/growth.js";
import { type ToolDef, registerTools } from "../../src/tools/registry.js";
import { fakeClock, tempDir } from "./helpers.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const text = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const json = <T>(name: string): T => JSON.parse(text(name)) as T;

// Tuesday 24 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 24, 10, 0);
const GROWTH_TOOLS = ["growth_profile", "growth_strategy", "growth_ideas", "growth_calendar", "review_post", "growth_report"];

interface Calls {
  myPosts: number;
  postAnalytics: string[];
  profileAnalytics: number;
  browserRuns: number;
}

function fakeReader(calls: Calls, opts: { analyticsError?: Error; dashboardError?: Error } = {}): LinkedInReader {
  return {
    myPosts: async (_nav, publicId, limit) => {
      calls.myPosts++;
      expect(publicId).toBe("jane-doe");
      return { posts: parsePosts(json<Snapshot[]>("growth-my-posts.json"), limit, { includePromoted: true }), complete: true };
    },
    postAnalytics: async (_nav, url) => {
      calls.postAnalytics.push(url);
      if (opts.analyticsError) throw opts.analyticsError;
      return { post_urn: url, metrics: readMetrics(text("post-analytics.txt"), POST_METRICS), demographics: [] };
    },
    profileAnalytics: async () => {
      calls.profileAnalytics++;
      if (opts.dashboardError) throw opts.dashboardError;
      return { metrics: readMetrics(text("dashboard.txt"), PROFILE_METRICS) };
    },
    myProfile: async () => ({ name: "Jane Doe", profile_url: "https://www.linkedin.com/in/jane-doe/", public_id: "jane-doe" }),
  };
}

async function setup(opts: { env?: Record<string, string>; remainingMs?: number; analyticsError?: Error; dashboardError?: Error } = {}) {
  const config = loadConfig({ LINKEDIN_MCP_HOME: tempDir(), ...opts.env });
  const clock = fakeClock(NOW);
  const ctx: AppContext = createContext(config, clock.clock);
  const calls: Calls = { myPosts: 0, postAnalytics: [], profileAnalytics: 0, browserRuns: 0 };
  ctx.session = {
    run: async (fn: (nav: unknown) => Promise<unknown>) => {
      calls.browserRuns++;
      return fn({ requireSessionCookie: async () => undefined, page: {}, deadline: { remainingMs: () => opts.remainingMs ?? 50_000 } });
    },
    close: async () => undefined,
    isOpen: () => false,
  } as unknown as BrowserSession;
  await ctx.account.update({ public_id: "jane-doe" });

  const server = new McpServer({ name: "growth-test", version: "0.0.0" });
  registerTools(server, ctx, makeGrowthTools(fakeReader(calls, opts)) as unknown as ToolDef[]);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientT);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
    const raw = r.content[0]!.text;
    // The SDK rejects input that fails the schema itself, with a plain-text message.
    const body = raw.startsWith("{") ? (JSON.parse(raw) as Record<string, any>) : { error: { message: raw } };
    return { isError: Boolean(r.isError), body };
  };
  return { ctx, client, call, calls, clock, files: growthFiles(config.paths.growthDir) };
}

const ownerOnly = (path: string) => process.platform === "win32" || (statSync(path).mode & 0o077) === 0;

describe("growth tools over MCP", () => {
  it("lists all six tools with their schemas, also in read-only mode", async () => {
    const { client } = await setup({ env: { LINKEDIN_MCP_READ_ONLY: "true" } });
    const tools = (await client.listTools()).tools;
    const names = tools.map((t) => t.name);
    expect(names).toEqual(GROWTH_TOOLS);
    const review = tools.find((t) => t.name === "review_post")!;
    expect(review.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    expect(Object.keys(review.inputSchema.properties ?? {})).toEqual(expect.arrayContaining(["text", "funnel_stage", "fold"]));
    expect(tools.find((t) => t.name === "growth_report")!.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: true });
    for (const t of tools.filter((x) => x.name !== "growth_report")) expect(t.description).toMatch(/never sends anything to LinkedIn/);
  });

  it("runs the whole loop: profile, strategy, ideas, calendar, review, report", async () => {
    const { call, calls, ctx, files } = await setup();

    // Profile
    const empty = await call("growth_profile");
    expect(empty.body.completeness.ready_for_strategy).toBe(false);
    expect(empty.body.completeness.next_questions).toHaveLength(3);
    const profile = await call("growth_profile", { action: "update", patch: json("growth-profile.json") });
    expect(profile.isError).toBe(false);
    expect(profile.body.completeness).toMatchObject({ ready_for_strategy: true, score: 100 });
    expect(ownerOnly(files.profile)).toBe(true);

    // Strategy: draft without time windows gets them from the profile.
    const draftInput = json<Record<string, any>>("growth-strategy.json");
    delete draftInput.cadence.time_windows;
    const draft = await call("growth_strategy", { action: "save_draft", strategy: draftInput, change_note: "first draft" });
    expect(draft.isError).toBe(false);
    expect(draft.body.saved_version).toBe(1);
    expect(draft.body.draft.strategy.cadence).toMatchObject({ time_windows: [{ start: "08:00", end: "10:00" }], source: "user" });
    expect(draft.body.fill_notes.join()).toMatch(/time_windows filled from the times you said you can post/);
    expect(draft.body.draft.approval_check.blocking).toEqual([]);
    const notYet = await call("growth_strategy", { action: "approve" });
    expect(notYet.isError).toBe(true);
    expect(notYet.body.error.message).toMatch(/approve: true/);
    const approved = await call("growth_strategy", { action: "approve", approve: true });
    expect(approved.body).toMatchObject({ approved_version: 1, approved: { version: 1 } });
    expect(approved.body.draft).toBeUndefined(); // null fields are left out of tool results
    const md = readFileSync(files.strategyMarkdown, "utf8");
    expect(md).toContain("## Approved strategy (v1");
    expect(md).toContain("For B2B SaaS founders at 1-10M ARR");
    expect(ownerOnly(files.strategyMarkdown)).toBe(true);

    // Ideas
    const ideas = await call("growth_ideas", {
      action: "add",
      ideas: [
        { thesis: "Onboarding can lose half its steps", pillar: "Onboarding teardown", funnel_stage: "TOF", method: "listicle", hooks: ["Delete these 3 steps.", "11 steps. You need 5."], scores: { audience_fit: 5, proof_strength: 4, novelty: 3, effort: 2 } },
        { thesis: "Churn starts in week one", pillar: "Churn myths", hooks: ["Churn starts on day 1.", "Your churn problem is an onboarding problem."], evidence: { needed: "cohort data", available: false } },
      ],
    });
    expect(ideas.body.added.map((i: any) => i.id)).toEqual(["idea-1", "idea-2"]);
    expect(ideas.body.warnings.join()).toMatch(/pillar "Churn myths" isn't in the strategy/);
    expect(ideas.body.warnings.join()).toMatch(/evidence not available/);
    const tooFewHooks = await call("growth_ideas", { action: "add", ideas: [{ thesis: "x", hooks: ["one"] }] });
    expect(tooFewHooks.isError).toBe(true);

    // Calendar
    const gen = await call("growth_calendar", { action: "generate", from: "2026-11-25", to: "2026-12-06" });
    expect(gen.isError).toBe(false);
    expect(gen.body.created.map((s: any) => `${s.weekday} ${s.date} ${s.time}`)).toEqual(["wed 2026-11-25 08:00", "fri 2026-11-27 08:00", "mon 2026-11-30 08:00", "wed 2026-12-02 08:00", "fri 2026-12-04 08:00"]);
    const pillars = gen.body.created.map((s: any) => s.pillar);
    expect(pillars.filter((p: string) => p === "Onboarding teardown")).toHaveLength(2);
    expect(new Set(pillars).size).toBe(3);
    expect(gen.body.created[0]).toMatchObject({ status: "planned", origin: "cadence", funnel_stage: "TOF" });
    const again = await call("growth_calendar", { action: "generate", from: "2026-11-25", to: "2026-12-06" });
    expect(again.body.created).toEqual([]);

    const slotId = gen.body.created[0].id as string;
    const draftText = "Your onboarding has 11 steps. It needs 5.\n\nAt Acme we deleted 6 steps after one 40-minute call in August.\n\nOnboarding went from 14 days to 3.\n\nWhich step would you delete first?";
    const upd = await call("growth_calendar", { action: "update", slot_id: slotId, idea_id: "idea-1", draft_text: draftText });
    expect(upd.isError).toBe(false);
    expect(upd.body.slot).toMatchObject({ status: "drafted", idea_id: "idea-1", method: "listicle", draft_text: draftText });
    expect(upd.body.review.score).toBeGreaterThanOrEqual(85);
    expect(upd.body.slot.review.ready_to_post).toBe(true);
    expect((await call("growth_ideas", { action: "list" })).body.ideas.find((i: any) => i.id === "idea-1").status).toBe("drafted");

    await call("growth_calendar", { action: "update", slot_id: slotId, status: "ready" });
    const upcoming = await call("growth_calendar");
    const ready = upcoming.body.slots.find((s: any) => s.id === slotId);
    expect(ready.schedule_post_input).toEqual({ text: draftText, publish_at: "2026-11-25T08:00" });
    expect(upcoming.body.needs_attention.find((n: any) => n.slot_id === slotId).next_step).toMatch(/schedule_post/);
    expect(upcoming.body.counts).toMatchObject({ ready: 1, planned: 4 });

    const sched = await call("growth_calendar", { action: "update", slot_id: slotId, scheduled_for: "2026-11-25T08:00" });
    expect(sched.body.slot.status).toBe("scheduled");
    expect((await call("growth_ideas", { action: "list", filters: { status: ["scheduled"] } })).body.ideas.map((i: any) => i.id)).toEqual(["idea-1"]);

    // Review uses the profile's banned words and the other drafts.
    const r = await call("review_post", { text: "Our synergy playbook cut onboarding to 3 days.\n\nWhat would you add?", funnel_stage: "TOF" });
    expect(r.body.checks.find((c: any) => c.id === "banned_phrases")).toMatchObject({ status: "fail" });
    expect(r.body.blockers).toContain("banned_phrases");
    const repeat = await call("review_post", { text: "Your onboarding has 11 steps. Mine had 14.\n\nWhat would you cut?" });
    expect(repeat.body.checks.find((c: any) => c.id === "repeated_opening")).toMatchObject({ status: "fail" });
    const explained = await call("review_post", { text: "Short post.", explain: true, use_profile: false, compare_history: false });
    expect(explained.body.bases.engagement_bait.confidence).toBe("platform");

    // Report
    const report = await call("growth_report");
    expect(report.isError).toBe(false);
    expect(report.body.read).toEqual({ posts: 4, reposts_skipped: 1, post_analytics: 3, profile: true, complete: true });
    expect(report.body.saved).toEqual({ added: 5, updated: 0 });
    expect(calls.postAnalytics).toHaveLength(3);
    expect(calls.postAnalytics[0]).toContain("7530672763699201234"); // newest first
    expect(report.body.summary).toMatchObject({ posts_in_window: 4, posts_compared: 3, sample: "n=3, directional only", confidence: "low" });
    expect(report.body.recommendations[0]).toMatchObject({ area: "data", confidence: "low" });
    expect(report.body.kpis.map((k: any) => k.name)).toEqual(["Followers", "Median engagement rate", "Audit calls a month"]);
    expect(report.body.strategy_version).toBe("approved v1");
    const lines = readFileSync(files.history, "utf8").trim().split("\n");
    expect(lines).toHaveLength(5);
    expect(ownerOnly(files.history)).toBe(true);

    // Same day again: one record per post per day.
    const second = await call("growth_report", { post_analytics: 0 });
    expect(second.body.saved.added).toBe(0);
    expect(readFileSync(files.history, "utf8").trim().split("\n")).toHaveLength(5);

    // Offline doesn't touch the browser.
    const runs = calls.browserRuns;
    const offline = await call("growth_report", { offline: true });
    expect(offline.body.mode).toBe("offline");
    expect(calls.browserRuns).toBe(runs);
    expect(offline.body.summary.posts_in_window).toBe(4);

    // Nothing was sent or queued for sending.
    expect(await ctx.audit.recent(10)).toEqual([]);
  });

  it("links a published post to the calendar slot whose draft it matches", async () => {
    const { call, files } = await setup();
    await addSlots(files.calendar, [{ date: "2026-11-20", time: "09:00" }], "manual", { status: "scheduled", idea_id: "idea-1", draft_text: "Stop sending welcome emails on day one.\n\nSend the first win instead. Here's the full version." }, NOW);
    const r = await call("growth_report", { post_analytics: 0, profile_analytics: false });
    expect(r.body.linked_calendar_slots).toEqual([{ slot_id: "slot-1", post_url: "https://www.linkedin.com/feed/update/urn:li:activity:7529468579020801234/" }]);
    const cal = await call("growth_calendar", { action: "list", from: "2026-11-01" });
    expect(cal.body.slots[0]).toMatchObject({ status: "published", published_at: "2026-11-20T09:00:00.000Z" });
    expect(r.body.posts.find((p: any) => p.slot_id === "slot-1")).toBeTruthy();
  });

  it("skips extra page loads when the call is short of time", async () => {
    const { call, calls } = await setup({ remainingMs: 5_000 });
    const r = await call("growth_report");
    expect(r.isError).toBe(false);
    expect(calls.profileAnalytics).toBe(0);
    expect(calls.postAnalytics).toEqual([]);
    expect(r.body.notes.join()).toMatch(/Skipped the analytics dashboard: not enough time left/);
    expect(r.body.saved.added).toBe(4);
  });

  it("notes a broken dashboard read and carries on", async () => {
    const { call } = await setup({ dashboardError: selectorBroken("analytics.dashboard") });
    const r = await call("growth_report", { post_analytics: 1 });
    expect(r.isError).toBe(false);
    expect(r.body.read.profile).toBe(false);
    expect(r.body.read.post_analytics).toBe(1);
    expect(r.body.notes.join()).toMatch(/Couldn't read the analytics dashboard/);
  });

  it("saves what it read, then stops, when LinkedIn shows a checkpoint", async () => {
    const checkpoint = new LinkedInMcpError("CHECKPOINT", "LinkedIn is asking for a security check.", "Open LinkedIn in a normal browser and complete the check.");
    const { call, files } = await setup({ analyticsError: checkpoint });
    const r = await call("growth_report");
    expect(r.isError).toBe(true);
    expect(r.body.error).toMatchObject({ code: "CHECKPOINT", next_step: expect.stringMatching(/complete the check/) });
    expect(r.body.error.details.saved_snapshots).toBe(5);
    expect(existsSync(files.history)).toBe(true);
    const offline = await call("growth_report", { offline: true });
    expect(offline.body.summary.posts_in_window).toBe(4);
  });

  it("adds a manual slot with a carousel and warns about a missing file", async () => {
    const { call } = await setup();
    const deck = join(tempDir(), "missing-deck.pdf");
    const r = await call("growth_calendar", { action: "add", date: "2026-12-01", time: "12:30", draft_text: "Short draft.\n\nWhat would you add?", media_paths: [deck], document_title: "5 onboarding fixes" });
    expect(r.isError).toBe(false);
    expect(r.body.slot).toMatchObject({ status: "drafted", origin: "manual", weekday: "tue" });
    expect(r.body.notes.join()).toMatch(/Media file not found yet/);
    await call("growth_calendar", { action: "update", slot_id: r.body.slot.id, status: "ready" });
    const up = await call("growth_calendar", { action: "upcoming", days: 14 });
    expect(up.body.slots[0].schedule_post_input).toEqual({ text: "Short draft.\n\nWhat would you add?", document: { path: deck, title: "5 onboarding fixes" }, publish_at: "2026-12-01T12:30" });
  });

  it("rejects bad input with clear errors", async () => {
    const { call } = await setup();
    expect((await call("growth_profile", { action: "update" })).body.error.message).toMatch(/patch, append or unset/);
    expect((await call("growth_profile", { action: "update", patch: { proof_bank: [{ kind: "win", title: "No date or source" }] } })).isError).toBe(true);
    expect((await call("growth_strategy", { action: "save_draft" })).body.error.message).toMatch(/needs `strategy`/);
    expect((await call("growth_calendar", { action: "generate" })).body.error.message).toMatch(/Set a cadence first/);
    expect((await call("growth_calendar", { action: "add", date: "2026-11-01", time: "09:00" })).body.error.message).toMatch(/in the past/);
    expect((await call("growth_calendar", { action: "update", slot_id: "slot-9" })).body.error.message).toMatch(/doesn't exist/);
    expect((await call("growth_calendar", { action: "add", date: "2026-12-01", time: "9am" })).isError).toBe(true);
    expect((await call("growth_calendar", { action: "add", date: "2026-12-01", time: "09:00", media_paths: ["relative.png"] })).isError).toBe(true);
    expect((await call("review_post", { text: "x", slot_id: "slot-404" })).body.error.message).toMatch(/doesn't exist/);
  });
});
