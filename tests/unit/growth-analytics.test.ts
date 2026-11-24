import { copyFileSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hookType, inferMethod } from "../../src/growth/analytics/classify.js";
import {
  type HistoryRecord,
  type PostSnapshot,
  isRepost,
  latestByPost,
  mergeHistory,
  parseHistory,
  postSnapshot,
  profileSnapshot,
  readHistory,
  saveSnapshots,
  withPostAnalytics,
} from "../../src/growth/analytics/history.js";
import { buildReport, matchSlot, suggestedWindows } from "../../src/growth/analytics/insights.js";
import {
  ANALYTICS_RULES,
  bestAndWorst,
  commentRate,
  confidenceFor,
  engagementRate,
  estimatePostedAt,
  groupStats,
  kpiProgress,
  median,
  postedAtFromUrn,
  sampleNote,
  trend,
  windowFromLabel,
} from "../../src/growth/analytics/math.js";
import type { Slot, StrategyDraft } from "../../src/growth/workspace/schemas.js";
import { POST_METRICS, PROFILE_METRICS, readMetrics } from "../../src/linkedin/parse/analytics.js";
import { parsePosts } from "../../src/linkedin/parse/feed.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";
import { tempDir } from "./helpers.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const text = (name: string) => readFileSync(join(FIXTURES, name), "utf8");
const NOW = new Date(2026, 10, 24, 10, 0);

/** A post URN whose id encodes this time, like LinkedIn's. */
const urnAt = (d: Date) => `urn:li:activity:${((BigInt(d.getTime()) << 22n) + 7n).toString()}`;

describe("analytics math", () => {
  it("defines engagement and comment rate over impressions, with hidden zero counts as 0", () => {
    expect(engagementRate({ impressions: 1000, reactions: 40, comments: 8, reposts: 2 })).toBeCloseTo(0.05);
    expect(engagementRate({ impressions: 1000, reactions: 40, comments: null, reposts: null })).toBeCloseTo(0.04);
    expect(engagementRate({ impressions: null, reactions: 40, comments: 8, reposts: 2 })).toBeNull();
    expect(engagementRate({ impressions: 0, reactions: 0, comments: 0, reposts: 0 })).toBeNull();
    expect(commentRate({ impressions: 400, reactions: 1, comments: 6, reposts: 0 })).toBeCloseTo(0.015);
  });

  it("uses medians and labels small samples", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(confidenceFor(4)).toBe("low");
    expect(confidenceFor(5)).toBe("medium");
    expect(confidenceFor(15)).toBe("high");
    expect(sampleNote(4)).toBe("n=4, directional only");
    expect(sampleNote(9)).toBe("n=9");
  });

  it("ranks groups only with enough posts and a real difference", () => {
    const m = (er: number) => ({ er, cr: er / 10, impressions: 1000 });
    const groups = groupStats([m(0.06), m(0.05), m(0.07), m(0.02), m(0.03), m(0.025), m(0.04)], (_x) => null);
    expect(groups).toEqual([]);
    const items = [...[0.06, 0.05, 0.07].map((er) => ({ ...m(er), k: "A" })), ...[0.02, 0.03, 0.025].map((er) => ({ ...m(er), k: "B" })), { ...m(0.04), k: "C" }];
    const stats = groupStats(items, (x) => x.k);
    expect(stats.map((g) => [g.key, g.n, g.median_er_pct])).toEqual([
      ["A", 3, 6],
      ["C", 1, 4],
      ["B", 3, 2.5],
    ]);
    expect(stats[0]!.lift_pct).toBe(50); // 6% vs overall median 4%
    const bw = bestAndWorst(stats, "pillars");
    expect(bw).toMatchObject({ best: { key: "A" }, worst: { key: "B" }, confidence: "low" });
    expect(bw.note).toMatch(/Directional only/);

    const close = groupStats([...[0.05, 0.05, 0.05].map((er) => ({ ...m(er), k: "A" })), ...[0.045, 0.045, 0.045].map((er) => ({ ...m(er), k: "B" }))], (x) => x.k);
    expect(bestAndWorst(close, "formats")).toMatchObject({ best: null, worst: null });
    expect(bestAndWorst(close, "formats").note).toMatch(/No clear difference/);
    expect(bestAndWorst(stats.filter((g) => g.key !== "B"), "x").note).toMatch(/at least 3 posts/);
  });

  it("decodes the posting time from a post id", () => {
    expect(postedAtFromUrn("urn:li:activity:7525837150617601234", NOW)!.toISOString()).toBe("2026-11-10T08:30:00.000Z");
    expect(postedAtFromUrn("urn:li:ugcPost:7529468579020801234", NOW)!.toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(postedAtFromUrn("urn:li:activity:7260000000000000001", NOW)!.getUTCFullYear()).toBe(2024);
    expect(postedAtFromUrn("urn:li:activity:123456789012345", NOW)).toBeNull(); // decodes to 1970
    expect(postedAtFromUrn("urn:li:activity:9999999999999999999", NOW)).toBeNull(); // in the future
    expect(postedAtFromUrn(null, NOW)).toBeNull();
    const at = new Date(2026, 10, 3, 9, 15);
    expect(postedAtFromUrn(urnAt(at), NOW)!.getTime()).toBe(at.getTime());
  });

  it("estimates a date from LinkedIn's relative time", () => {
    expect(estimatePostedAt("3d", NOW)!.getTime()).toBe(NOW.getTime() - 3 * 86_400_000);
    expect(estimatePostedAt("1w", NOW)!.getTime()).toBe(NOW.getTime() - 7 * 86_400_000);
    expect(estimatePostedAt("2mo", NOW)).not.toBeNull();
    expect(estimatePostedAt("Edited", NOW)).toBeNull();
  });

  it("computes trends between the first and last day", () => {
    const t = trend([
      { day: "2026-11-24", value: 4812 },
      { day: "2026-11-01", value: 4700 },
      { day: "2026-11-15", value: null },
    ]);
    expect(t).toMatchObject({ first: { day: "2026-11-01", value: 4700 }, last: { day: "2026-11-24", value: 4812 }, change: 112, days: 23, per_week: 34.1, change_pct: 2.4 });
    expect(trend([{ day: "2026-11-24", value: 1 }])).toBeNull();
  });

  it("tracks KPI progress against time elapsed", () => {
    const start = new Date(2026, 9, 1);
    const due = new Date(2027, 3, 1);
    const halfway = new Date(start.getTime() + (due.getTime() - start.getTime()) / 2);
    expect(kpiProgress({ target: 6000, current: 5500, baseline: 5000, start, due, now: halfway })).toMatchObject({ progress_pct: 50, time_elapsed_pct: 50, status: "on_track" });
    expect(kpiProgress({ target: 6000, current: 5100, baseline: 5000, start, due, now: halfway })).toMatchObject({ progress_pct: 10, status: "behind" });
    expect(kpiProgress({ target: 6000, current: 6100, baseline: 5000, start, due, now: halfway }).status).toBe("achieved");
    expect(kpiProgress({ target: 6000, current: null, baseline: 5000, start, due, now: halfway }).status).toBe("no_data");
    expect(kpiProgress({ target: 6000, current: 5100, baseline: 5000, start, due, now: new Date(2027, 4, 1) }).status).toBe("past_due");
    // A target below the baseline (e.g. cutting time spent): lower is progress.
    expect(kpiProgress({ target: 2, current: 3, baseline: 4, start, due, now: halfway })).toMatchObject({ progress_pct: 50, status: "on_track" });
  });

  it("maps window labels back to time windows", () => {
    expect(windowFromLabel("09:00–12:00")).toEqual({ start: "09:00", end: "12:00" });
    expect(windowFromLabel("21:00–24:00")).toEqual({ start: "21:00", end: "23:59" });
    expect(windowFromLabel("nope")).toBeNull();
  });
});

describe("hook and method classification", () => {
  it.each([
    ["I'm thrilled to announce our Series A", "announcement"],
    ["7 lessons from 7 years of hiring", "list"],
    ["How we cut churn in half", "how_to"],
    ["What would you cut first?", "question"],
    ["Unpopular opinion: OKRs are overrated", "contrarian"],
    ["In 2019 I was fired on a Tuesday.", "story"],
    ["\"Ship it on Friday,\" my manager said.", "quote"],
    ["Revenue grew 38% this quarter.", "number"],
    ["Onboarding is a sequencing problem.", "statement"],
  ])("%j is a %s hook", (line, type) => {
    expect(hookType(line)).toBe(type);
  });

  it("infers the method from the text", () => {
    expect(inferMethod("3 onboarding steps you can delete today:\n1. a\n2. b\n3. c")).toBe("listicle");
    expect(inferMethod("How I hired 12 engineers in a month\n\nDetails.")).toBe("how-to");
    expect(inferMethod("Last year I quit my job.\nI started a company.\nWe failed.\nI learned a lot.")).toBe("story");
    expect(inferMethod("Onboarding is a sequencing problem.\nFix the order first.")).toBe("insight");
  });
});

describe("snapshots from LinkedIn reads", () => {
  const posts = parsePosts(JSON.parse(text("growth-my-posts.json")) as Snapshot[], 20, { includePromoted: true });

  it("turns get_my_posts results into dated snapshots, skipping reposts", () => {
    const own = posts.filter((p) => !isRepost(p));
    expect(posts).toHaveLength(5);
    expect(own).toHaveLength(4);
    const s = own.map((p) => postSnapshot(p, NOW));
    expect(s.map((x) => [x.posted_at, x.posted_at_source, x.impressions])).toEqual([
      ["2026-11-23T16:45:00.000Z", "urn", 1210],
      ["2026-11-20T09:00:00.000Z", "urn", 1500],
      ["2026-11-17T12:00:00.000Z", "urn", 2100],
      ["2026-11-10T08:30:00.000Z", "urn", 8934],
    ]);
    expect(s[3]).toMatchObject({ key: "urn:li:activity:7525837150617601234", day: "2026-11-24", first_line: "We lost our biggest client in March 2025. It was 38% of revenue.", reactions: 248, comments: 31, reposts: 12, sources: ["my_posts"] });
  });

  it("falls back to the relative date or a text key when there is no URN", () => {
    const s = postSnapshot({ ...posts[0]!, urn: null, url: null, posted: "3d" }, NOW);
    expect(s.posted_at_source).toBe("relative");
    expect(s.key).toMatch(/^text:[0-9a-f]{16}$/);
  });

  it("adds post analytics and dashboard numbers read by the existing parsers", () => {
    const s = withPostAnalytics(postSnapshot(posts[4]!, NOW), readMetrics(text("post-analytics.txt"), POST_METRICS));
    expect(s).toMatchObject({ impressions: 8934, members_reached: 5210, followers_gained: 27, saves: 19, sends: 6, sources: ["my_posts", "post_analytics"] });
    const p = profileSnapshot(readMetrics(text("dashboard.txt"), PROFILE_METRICS), NOW);
    expect(p).toMatchObject({ kind: "profile", day: "2026-11-24", followers: 4812, post_impressions: 12480, profile_viewers: 356, search_appearances: 1029 });
    expect(p.changes.Followers).toBe("1.1% past 7 days");
  });
});

describe("history file", () => {
  it("parses the history, ignoring invalid lines, and merges same-day records", () => {
    const h = parseHistory(text("growth-history.jsonl"));
    expect(h.records).toHaveLength(6);
    expect(h.skipped_lines).toBe(2);
    const latest = latestByPost(h.records);
    expect(latest.posts).toHaveLength(1);
    // The newest snapshot wins; fields only the older one had are kept.
    expect(latest.posts[0]).toMatchObject({ impressions: 8934, members_reached: 3100, sources: ["my_posts", "post_analytics"] });
    expect(latest.profile.map((p) => [p.day, p.followers, p.search_appearances])).toEqual([
      ["2026-11-01", 4700, 880],
      ["2026-11-15", 4790, 951],
      ["2026-11-24", 4812, 1000],
    ]);
  });

  it("keeps one record per post per day", () => {
    const base = parseHistory(text("growth-history.jsonl")).records.filter((r) => r.kind === "post") as PostSnapshot[];
    const today = base[1]!;
    const sameDay = { ...today, impressions: 9000, captured_at: "2026-11-24T18:00:00.000Z" };
    const nextDay = { ...today, day: "2026-11-25", impressions: 9100 };
    const r = mergeHistory(base, [sameDay, nextDay]);
    expect(r).toMatchObject({ added: 1, updated: 1, replaced: true });
    expect(r.records.filter((x) => x.day === "2026-11-24")).toHaveLength(1);
    expect((r.records[1] as PostSnapshot).impressions).toBe(9000);
    expect(mergeHistory(r.records, [sameDay])).toMatchObject({ added: 0, updated: 0, replaced: false });
  });

  it("appends new days, rewrites a changed day, and is idempotent", async () => {
    const file = join(tempDir(), "growth", "analytics", "history.jsonl");
    const posts = parsePosts(JSON.parse(text("growth-my-posts.json")) as Snapshot[], 20, { includePromoted: true }).filter((p) => !isRepost(p));
    const snaps: HistoryRecord[] = posts.map((p) => postSnapshot(p, NOW));
    expect(await saveSnapshots(file, snaps)).toEqual({ added: 4, updated: 0 });
    expect(await saveSnapshots(file, snaps)).toEqual({ added: 0, updated: 0 });
    expect(readFileSync(file, "utf8").trim().split("\n")).toHaveLength(4);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o077).toBe(0);

    const later = new Date(NOW.getTime() + 3_600_000);
    const updated = posts.map((p) => postSnapshot({ ...p, impressions: (p.impressions ?? 0) + 10 }, later));
    expect(await saveSnapshots(file, updated)).toEqual({ added: 0, updated: 4 });
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    expect(await saveSnapshots(file, [postSnapshot(posts[0]!, tomorrow)])).toEqual({ added: 1, updated: 0 });
    const h = await readHistory(file);
    expect(h.records).toHaveLength(5);
    expect((h.records[0] as PostSnapshot).impressions).toBe(1220);
  });

  it("keeps a copy of invalid lines before rewriting", async () => {
    const dir = join(tempDir(), "analytics");
    const file = join(dir, "history.jsonl");
    await saveSnapshots(file, [profileSnapshot(readMetrics(text("dashboard.txt"), PROFILE_METRICS), NOW)]);
    copyFileSync(file, `${file}.bak`);
    writeFileSync(file, `${readFileSync(`${file}.bak`, "utf8")}garbage line\n`);
    await saveSnapshots(file, [profileSnapshot({ Followers: { value: 4900, change: null } }, NOW)]);
    expect(readdirSync(dir).some((f) => f.startsWith("history.jsonl.invalid-lines-"))).toBe(true);
    expect((await readHistory(file)).records).toHaveLength(1);
    expect(await readHistory(join(dir, "missing.jsonl"))).toEqual({ records: [], skipped_lines: 0 });
  });
});

// --- Insights -------------------------------------------------------------

function post(at: Date, counts: { impressions: number; reactions: number; comments: number; reposts?: number }, firstLine: string, capturedAt = NOW): PostSnapshot {
  const urn = urnAt(at);
  return {
    kind: "post",
    key: urn,
    day: "2026-11-24",
    captured_at: capturedAt.toISOString(),
    urn,
    url: `https://www.linkedin.com/feed/update/${urn}/`,
    posted_at: at.toISOString(),
    posted_at_source: "urn",
    posted_relative: null,
    first_line: firstLine,
    text: `${firstLine}\n\nMore text that explains it.`,
    impressions: counts.impressions,
    reactions: counts.reactions,
    comments: counts.comments,
    reposts: counts.reposts ?? 0,
    sources: ["my_posts"],
  };
}

function slotFor(p: PostSnapshot, i: number, pillar: string, format: Slot["format"]): Slot {
  return { id: `slot-${i}`, date: p.posted_at!.slice(0, 10), time: "09:00", status: "published", origin: "cadence", pillar, funnel_stage: pillar === "Teardown" ? "TOF" : "MOF", format, post_url: p.url!, created_at: "", updated_at: "" };
}

/** Six weeks: Tuesday-morning teardowns do well, Friday-afternoon retention posts don't. */
function sixWeeks() {
  const records: PostSnapshot[] = [];
  const slots: Slot[] = [];
  for (let w = 0; w < 6; w++) {
    const tue = new Date(2026, 9, 13 + w * 7, 9, 30);
    const fri = new Date(2026, 9, 16 + w * 7, 16, 0);
    const good = post(tue, { impressions: 2000 + w * 100, reactions: 90, comments: 12, reposts: 3 }, `${w + 3} onboarding steps to delete`);
    const weak = post(fri, { impressions: 1500, reactions: 25, comments: 1 }, "Retention is a team sport.");
    records.push(good, weak);
    slots.push(slotFor(good, w * 2 + 1, "Teardown", "carousel"), slotFor(weak, w * 2 + 2, "Retention", "text"));
  }
  return { records, slots };
}

describe("growth report", () => {
  const strategy: StrategyDraft = {
    cadence: { posts_per_week: 3 },
    kpis: [
      { name: "Followers", metric: "followers", target: 6000, by: "2027-06-30" },
      { name: "Engagement", metric: "avg_engagement_rate", target: 3, by: "2027-03-31" },
      { name: "Calls", metric: "manual", target: 4, baseline: 1, current: 2, by: "2027-03-31" },
    ],
  };

  it("finds the best pillar, format, weekday and time window, with confidence", () => {
    const { records, slots } = sixWeeks();
    const r = buildReport({ records, slots, ideas: [], strategy, strategy_start: null, now: NOW, window_days: 90 });
    expect(r.summary).toMatchObject({ posts_in_window: 12, posts_compared: 12, sample: "n=12", confidence: "medium" });
    expect(r.best_and_worst.pillars).toMatchObject({ best: { key: "Teardown", n: 6 }, worst: { key: "Retention", n: 6 }, confidence: "medium" });
    expect(r.best_and_worst.formats).toMatchObject({ best: { key: "carousel" }, worst: { key: "text" } });
    expect(r.timing.best_weekday).toMatchObject({ best: { key: "Tue" }, worst: { key: "Fri" } });
    expect(r.timing.best_time_window.best!.key).toBe("09:00–12:00");
    expect(r.timing.suggested_time_windows).toEqual([{ start: "09:00", end: "12:00" }]);
    expect(r.recommendations.map((x) => x.area)).toEqual(expect.arrayContaining(["pillars", "formats", "timing"]));
    const timing = r.recommendations.find((x) => x.area === "timing")!;
    expect(timing.text).toMatch(/on Tue around 09:00–12:00/);
    expect(timing.confidence).toBe("medium");
    expect(r.posts[0]).toMatchObject({ pillar: "Retention", format: "text", slot_id: "slot-12" });
    expect(r.definitions.engagement_rate).toMatch(/reactions \+ comments \+ reposts/);
  });

  it("never overclaims on a small sample", () => {
    const { records, slots } = sixWeeks();
    const r = buildReport({ records: records.slice(-4), slots, ideas: [], strategy: null, strategy_start: null, now: NOW, window_days: 90 });
    expect(r.summary).toMatchObject({ posts_compared: 4, sample: "n=4, directional only", confidence: "low" });
    expect(r.recommendations[0]).toMatchObject({ area: "data", confidence: "low" });
    expect(r.timing.note).toMatch(/directional only/);
    expect(r.best_and_worst.pillars.best).toBeNull();
    expect(r.timing.suggested_time_windows).toEqual([]);
  });

  it("leaves fresh posts out of comparisons, and infers methods for unplanned posts", () => {
    const fresh = post(new Date(NOW.getTime() - 5 * 3_600_000), { impressions: 300, reactions: 30, comments: 9 }, "How we cut churn in half");
    const old = post(new Date(2026, 10, 2, 9, 0), { impressions: 1000, reactions: 20, comments: 1 }, "7 lessons from 7 years of hiring");
    const r = buildReport({ records: [fresh, old], slots: [], ideas: [], strategy: null, strategy_start: null, now: NOW, window_days: 90 });
    expect(r.summary.posts_compared).toBe(1);
    expect(r.notes.join()).toMatch(/younger than 48 hours/);
    expect(r.posts.map((p) => [p.method, p.hook_type, p.settled])).toEqual([
      ["how-to (inferred)", "how_to", false],
      ["listicle (inferred)", "list", true],
    ]);
  });

  it("reports follower trend and KPI progress from dashboard snapshots", () => {
    const h = parseHistory(text("growth-history.jsonl")).records;
    // Approved 1 Nov: 9% of the way with 10% of the time gone is on track.
    const r = buildReport({ records: h, slots: [], ideas: [], strategy, strategy_start: new Date(2026, 10, 1).toISOString(), now: NOW, window_days: 90 });
    expect(r.audience_growth.followers).toMatchObject({ change: 112, days: 23, linkedin_change: "1.1% past 7 days" });
    const followers = r.kpis.find((k) => k.metric === "followers")!;
    expect(followers).toMatchObject({ current: 4812, baseline: 4700, progress_pct: 9, time_elapsed_pct: 10, status: "on_track" });
    expect(followers.note).toMatch(/baseline from the dashboard on 2026-11-01/);
    expect(r.kpis.find((k) => k.metric === "manual")).toMatchObject({ current: 2, baseline: 1 });
    expect(r.kpis.find((k) => k.metric === "avg_engagement_rate")!.current).toBe(3.26); // (248 + 31 + 12) / 8934
    expect(r.recommendations.some((x) => x.area === "cadence")).toBe(true);

    // Approved in June: the same numbers are now behind.
    const june = buildReport({ records: h, slots: [], ideas: [], strategy, strategy_start: new Date(2026, 5, 1).toISOString(), now: NOW, window_days: 90 });
    expect(june.kpis.find((k) => k.metric === "followers")).toMatchObject({ status: "behind", time_elapsed_pct: 45 });
    expect(june.recommendations.some((x) => x.area === "kpi" && /"Followers" is behind/.test(x.text))).toBe(true);
  });

  it("matches posts to calendar drafts by URL or opening text", () => {
    const p = post(new Date(2026, 10, 10, 9), { impressions: 1, reactions: 0, comments: 0 }, "Stop sending welcome emails on day one, send the first win instead.");
    const draftSlot: Slot = { id: "slot-1", date: "2026-11-10", time: "09:00", status: "scheduled", origin: "manual", draft_text: `${p.first_line}\n\nA different ending in the draft.`, created_at: "", updated_at: "" };
    expect(matchSlot(p, [draftSlot])).toMatchObject({ by: "text", slot: { id: "slot-1" } });
    expect(matchSlot(p, [{ ...draftSlot, draft_text: undefined, post_url: `${p.url}?utm=x` }])).toMatchObject({ by: "url" });
    expect(matchSlot({ ...p, text: "Too short" }, [draftSlot])).toBeNull();
  });

  it("suggests windows only when the history supports them", () => {
    const { records, slots } = sixWeeks();
    expect(suggestedWindows(records, slots, [], NOW).windows).toEqual([{ start: "09:00", end: "12:00" }]);
    expect(suggestedWindows(records.slice(0, 2), slots, [], NOW).windows).toEqual([]);
    expect(ANALYTICS_RULES.min_group_n).toBe(3);
  });
});
