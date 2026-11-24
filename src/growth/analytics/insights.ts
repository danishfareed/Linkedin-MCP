import { addLocalDays, dayKeyToDate, localDayKey } from "../../util/time.js";
import type { Idea, Kpi, Slot, StrategyDraft, TimeWindow } from "../workspace/schemas.js";
import { formatFromMedia } from "../workspace/calendar.js";
import { type HookType, hookType, inferMethod } from "./classify.js";
import { type HistoryRecord, type PostSnapshot, type ProfileSnapshot, latestByPost } from "./history.js";
import {
  ANALYTICS_RULES,
  type BestWorst,
  type Confidence,
  type GroupStat,
  type KpiProgress,
  type Trend,
  bestAndWorst,
  commentRate,
  confidenceFor,
  engagementRate,
  groupStats,
  hourWindowOf,
  kpiProgress,
  median,
  pct,
  sampleNote,
  trend,
  weekdayLabel,
  windowFromLabel,
} from "./math.js";

/** What each number in the report means. Returned with every report. */
export const DEFINITIONS = {
  engagement_rate: "(reactions + comments + reposts) / impressions for one post. Counts LinkedIn hides because they are zero count as 0. Undefined without impressions.",
  comment_rate: "comments / impressions for one post.",
  median: "Group figures are medians across posts, so one viral post doesn't dominate.",
  lift_pct: "A group's median engagement rate compared with the median across all compared posts (+25 = 25% higher).",
  settled: `Posts younger than ${ANALYTICS_RULES.settle_hours} hours are still collecting impressions and are left out of comparisons.`,
  posting_time: "Posting day and time come from the post id (exact) or the calendar slot; posts with only a relative date ('3d') are left out of timing analysis. Times are local to this computer.",
  followers: "Total followers from the LinkedIn dashboard on each day the report ran.",
  profile_viewers: "LinkedIn's rolling 90-day profile viewer count from the dashboard, so its trend shows whether the 90-day count is rising.",
  confidence: `low below n=${ANALYTICS_RULES.confidence.medium_from} (directional only), medium from n=${ANALYTICS_RULES.confidence.medium_from}, high from n=${ANALYTICS_RULES.confidence.high_from}. Groups under n=${ANALYTICS_RULES.min_group_n} aren't ranked; differences under ${ANALYTICS_RULES.min_lift_pct}% aren't called out.`,
} as const;

export interface PostView {
  key: string;
  url: string | null;
  posted_at: string | null;
  posted_at_source: PostSnapshot["posted_at_source"];
  first_line: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  followers_gained: number | null;
  saves: number | null;
  er: number | null;
  cr: number | null;
  pillar: string | null;
  funnel_stage: string | null;
  method: string;
  method_source: "plan" | "inferred";
  format: string | null;
  format_source: "plan" | "unknown";
  hook_type: HookType;
  slot_id: string | null;
  idea_id: string | null;
  settled: boolean;
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function urnOf(url: string | null | undefined): string | null {
  return url ? (/urn:li:(?:activity|share|ugcPost):\d+/.exec(decodeURIComponent(url))?.[0] ?? null) : null;
}

const MATCH_CHARS = 60;
const MIN_MATCH_CHARS = 30;

/** The calendar slot a post came from: by URL, else by the opening of the draft text. */
export function matchSlot(post: Pick<PostSnapshot, "urn" | "text">, slots: Slot[]): { slot: Slot; by: "url" | "text" } | null {
  if (post.urn) {
    const byUrl = slots.find((s) => urnOf(s.post_url) === post.urn);
    if (byUrl) return { slot: byUrl, by: "url" };
  }
  const head = norm(post.text).slice(0, MATCH_CHARS);
  if (head.length < MIN_MATCH_CHARS) return null;
  const byText = slots.find((s) => s.draft_text && !s.post_url && norm(s.draft_text).slice(0, MATCH_CHARS) === head);
  return byText ? { slot: byText, by: "text" } : null;
}

export function toView(p: PostSnapshot, slots: Slot[], ideas: Idea[], now: Date): PostView & { matched_by: "url" | "text" | null } {
  const match = matchSlot(p, slots);
  const slot = match?.slot ?? null;
  const idea = slot?.idea_id ? (ideas.find((i) => i.id === slot.idea_id) ?? null) : null;
  let postedAt = p.posted_at;
  let source = p.posted_at_source;
  if (source !== "urn" && slot) {
    const planned = slot.published_at ?? slot.scheduled_for ?? null;
    if (planned && !Number.isNaN(new Date(planned).getTime())) {
      postedAt = new Date(planned).toISOString();
      source = "calendar";
    }
  }
  const plannedMethod = slot?.method ?? idea?.method ?? null;
  const plannedFormat = slot?.format ?? idea?.format ?? (slot?.media_paths ? formatFromMedia(slot.media_paths) : null) ?? (slot ? "text" : null);
  const settled = postedAt ? now.getTime() - new Date(postedAt).getTime() >= ANALYTICS_RULES.settle_hours * 3_600_000 : true;
  return {
    key: p.key,
    url: p.url,
    posted_at: postedAt,
    posted_at_source: source,
    first_line: p.first_line,
    impressions: p.impressions,
    reactions: p.reactions,
    comments: p.comments,
    reposts: p.reposts,
    followers_gained: p.followers_gained ?? null,
    saves: p.saves ?? null,
    er: engagementRate(p),
    cr: commentRate(p),
    pillar: slot?.pillar ?? idea?.pillar ?? null,
    funnel_stage: slot?.funnel_stage ?? idea?.funnel_stage ?? null,
    method: plannedMethod ?? inferMethod(p.text),
    method_source: plannedMethod ? "plan" : "inferred",
    format: plannedFormat,
    format_source: plannedFormat ? "plan" : "unknown",
    hook_type: hookType(p.first_line),
    slot_id: slot?.id ?? null,
    idea_id: slot?.idea_id ?? null,
    settled,
    matched_by: match?.by ?? null,
  };
}

export interface Recommendation {
  area: string;
  text: string;
  confidence: Confidence;
  evidence: string;
}

export interface KpiReport extends KpiProgress {
  name: string;
  metric: Kpi["metric"];
  target: number;
  by: string;
  note?: string;
}

export interface ReportInput {
  records: HistoryRecord[];
  slots: Slot[];
  ideas: Idea[];
  strategy: StrategyDraft | null;
  /** When the strategy was approved: the start for KPI time-elapsed. */
  strategy_start: string | null;
  now: Date;
  window_days: number;
}

function metricOf(s: ProfileSnapshot, metric: string): number | null {
  switch (metric) {
    case "followers":
      return s.followers;
    case "profile_viewers":
      return s.profile_viewers;
    case "post_impressions":
      return s.post_impressions;
    case "search_appearances":
      return s.search_appearances;
    default:
      return null;
  }
}

const nums = (xs: (number | null)[]) => xs.filter((x): x is number => x !== null);

function postsPerWeek(views: PostView[], now: Date, days = 28): number | null {
  const since = now.getTime() - days * 86_400_000;
  const dated = views.filter((v) => v.posted_at);
  if (!dated.length) return null;
  const recent = dated.filter((v) => new Date(v.posted_at!).getTime() >= since).length;
  return Math.round((recent / (days / 7)) * 10) / 10;
}

function kpiReports(input: ReportInput, views: PostView[], profile: ProfileSnapshot[]): KpiReport[] {
  const kpis = input.strategy?.kpis ?? [];
  const now = input.now;
  const start = input.strategy_start ? new Date(input.strategy_start) : profile[0] ? dayKeyToDate(profile[0].day) : now;
  const startDay = localDayKey(start);
  const recent = views.filter((v) => v.settled && v.posted_at && new Date(v.posted_at).getTime() >= now.getTime() - 28 * 86_400_000);
  return kpis.map((k) => {
    let current: number | null = null;
    let baseline: number | null = k.baseline ?? null;
    let note: string | undefined;
    switch (k.metric) {
      case "followers":
      case "profile_viewers":
      case "post_impressions":
      case "search_appearances": {
        const latest = [...profile].reverse().find((s) => metricOf(s, k.metric) !== null);
        current = latest ? metricOf(latest, k.metric) : null;
        if (baseline === null) {
          const first = profile.find((s) => s.day >= startDay && metricOf(s, k.metric) !== null) ?? profile.find((s) => metricOf(s, k.metric) !== null);
          baseline = first ? metricOf(first, k.metric) : null;
          if (first) note = `baseline from the dashboard on ${first.day}`;
        }
        break;
      }
      case "avg_impressions_per_post":
        current = median(nums(recent.map((v) => v.impressions)));
        note = `median over the last 28 days (${sampleNote(recent.length)})`;
        break;
      case "avg_engagement_rate":
        current = pct(median(nums(recent.map((v) => v.er))), 2);
        note = `median %, last 28 days (${sampleNote(recent.length)})`;
        break;
      case "avg_comment_rate":
        current = pct(median(nums(recent.map((v) => v.cr))), 2);
        note = `median %, last 28 days (${sampleNote(recent.length)})`;
        break;
      case "posts_per_week":
        current = postsPerWeek(views, now);
        note = "average over the last 28 days";
        break;
      case "manual":
        current = k.current ?? null;
        note = current === null ? "manual KPI: set current in the strategy to track it" : "manual KPI, value from the strategy";
        break;
    }
    const due = addLocalDays(dayKeyToDate(k.by), 1);
    const progress = kpiProgress({ target: k.target, current, baseline, start, due, now });
    return { name: k.name, metric: k.metric, target: k.target, by: k.by, ...progress, ...(note ? { note } : {}) };
  });
}

function growthTrends(profile: ProfileSnapshot[], sinceDay: string): Record<string, (Trend & { linkedin_change: string | null }) | { note: string }> {
  const inWindow = profile.filter((s) => s.day >= sinceDay);
  const latest = profile[profile.length - 1];
  const out: Record<string, (Trend & { linkedin_change: string | null }) | { note: string }> = {};
  const labels: Record<string, string> = { followers: "Followers", profile_viewers: "Profile viewers", post_impressions: "Post impressions", search_appearances: "Search appearances" };
  for (const [metric, label] of Object.entries(labels)) {
    const t = trend(inWindow.map((s) => ({ day: s.day, value: metricOf(s, metric) })));
    out[metric] = t
      ? { ...t, linkedin_change: latest?.changes[label] ?? null }
      : { note: `Needs dashboard readings on at least two different days${latest?.changes[label] ? `; LinkedIn shows ${latest.changes[label]}` : ""}.` };
  }
  return out;
}

function summarise(bw: BestWorst, area: string, label: (k: string) => string): Recommendation | null {
  if (!bw.best || !bw.worst) return null;
  return {
    area,
    text: `Lean into ${label(bw.best.key)} and rethink ${label(bw.worst.key)}: median engagement ${bw.best.median_er_pct}% vs ${bw.worst.median_er_pct}%.`,
    confidence: bw.confidence,
    evidence: `${bw.best.key} ${bw.best.sample}; ${bw.worst.key} ${bw.worst.sample}`,
  };
}

export interface GrowthReport {
  window: { days: number; from: string; to: string };
  definitions: typeof DEFINITIONS;
  summary: Record<string, number | string | null>;
  posts: Record<string, unknown>[];
  breakdowns: Record<"pillars" | "methods" | "formats" | "hook_types" | "weekdays" | "time_windows", GroupStat[]>;
  best_and_worst: Record<"pillars" | "methods" | "formats" | "hook_types", BestWorst>;
  timing: { best_weekday: BestWorst; best_time_window: BestWorst; suggested_time_windows: TimeWindow[]; note: string };
  audience_growth: ReturnType<typeof growthTrends>;
  kpis: KpiReport[];
  recommendations: Recommendation[];
  notes: string[];
}

/** Turns stored snapshots plus the plan into insights and recommendations. Pure. */
export function buildReport(input: ReportInput): GrowthReport {
  const { now } = input;
  const fromDay = localDayKey(addLocalDays(now, -input.window_days));
  const { posts, profile } = latestByPost(input.records);
  const views = posts
    .map((p) => toView(p, input.slots, input.ideas, now))
    .filter((v) => (v.posted_at ? localDayKey(new Date(v.posted_at)) >= fromDay : true))
    .sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? ""));
  const notes: string[] = [];

  const compared = views.filter((v) => v.settled && v.er !== null);
  const unsettled = views.filter((v) => !v.settled).length;
  const noImpressions = views.filter((v) => v.impressions === null).length;
  if (unsettled) notes.push(`${unsettled} post(s) younger than ${ANALYTICS_RULES.settle_hours} hours are listed but left out of comparisons.`);
  if (noImpressions) notes.push(`${noImpressions} post(s) have no impressions count, so no engagement rate.`);

  const timed = compared.filter((v) => v.posted_at_source === "urn" || v.posted_at_source === "calendar");
  const breakdowns = {
    pillars: groupStats(compared, (v) => v.pillar),
    methods: groupStats(compared, (v) => v.method),
    formats: groupStats(compared, (v) => v.format),
    hook_types: groupStats(compared, (v) => v.hook_type),
    weekdays: groupStats(timed, (v) => weekdayLabel(new Date(v.posted_at!))),
    time_windows: groupStats(timed, (v) => hourWindowOf(new Date(v.posted_at!))),
  };
  const best_and_worst = {
    pillars: bestAndWorst(breakdowns.pillars, "pillars"),
    methods: bestAndWorst(breakdowns.methods, "methods"),
    formats: bestAndWorst(breakdowns.formats, "formats"),
    hook_types: bestAndWorst(breakdowns.hook_types, "hook types"),
  };
  const bestWeekday = bestAndWorst(breakdowns.weekdays, "weekdays");
  const bestWindow = bestAndWorst(breakdowns.time_windows, "posting times");
  const suggested = breakdowns.time_windows
    .filter((g) => g.n >= ANALYTICS_RULES.min_group_n && (g.lift_pct ?? 0) >= ANALYTICS_RULES.min_lift_pct)
    .slice(0, 2)
    .map((g) => windowFromLabel(g.key))
    .filter((w): w is TimeWindow => w !== null);
  const timingNote =
    timed.length < ANALYTICS_RULES.confidence.medium_from
      ? `Only ${timed.length} post(s) with an exact posting time: timing results are directional only (${sampleNote(timed.length)}).`
      : `${timed.length} posts with an exact posting time (${sampleNote(timed.length)}).`;

  const planned = compared.filter((v) => v.slot_id).length;
  if (compared.length && planned < compared.length / 2) {
    notes.push(`${compared.length - planned} of ${compared.length} compared posts aren't linked to the calendar, so pillar and format comparisons only cover ${planned}. Methods and hook types are inferred from text for unlinked posts.`);
  }

  const medianEr = median(nums(compared.map((v) => v.er)));
  const pooledImpr = compared.reduce((a, v) => a + (v.impressions ?? 0), 0);
  const pooledEng = compared.reduce((a, v) => a + (v.reactions ?? 0) + (v.comments ?? 0) + (v.reposts ?? 0), 0);
  const summary = {
    posts_in_window: views.length,
    posts_compared: compared.length,
    sample: sampleNote(compared.length),
    confidence: confidenceFor(compared.length),
    median_impressions: median(nums(compared.map((v) => v.impressions))),
    median_engagement_rate_pct: pct(medianEr, 2),
    pooled_engagement_rate_pct: pooledImpr ? pct(pooledEng / pooledImpr, 2) : null,
    median_comment_rate_pct: pct(median(nums(compared.map((v) => v.cr))), 2),
    posts_per_week_last_28_days: postsPerWeek(views, now),
  };

  const recs: Recommendation[] = [];
  if (compared.length < ANALYTICS_RULES.confidence.medium_from) {
    recs.push({
      area: "data",
      text: `Only ${compared.length} settled post(s) with impressions so far. Keep posting to plan and run growth_report weekly; treat every pattern below as directional only.`,
      confidence: "low",
      evidence: sampleNote(compared.length),
    });
  }
  const labels: Record<string, (k: string) => string> = {
    pillars: (k) => `the "${k}" pillar`,
    methods: (k) => `${k} posts`,
    formats: (k) => `${k} posts`,
    hook_types: (k) => `${k.replace("_", "-")} hooks`,
  };
  for (const [area, bw] of Object.entries(best_and_worst)) {
    const r = summarise(bw, area, labels[area]!);
    if (r) recs.push(r);
  }
  if (bestWindow.best || bestWeekday.best) {
    const parts = [bestWeekday.best ? `on ${bestWeekday.best.key}` : null, bestWindow.best ? `around ${bestWindow.best.key}` : null].filter(Boolean).join(" ");
    const conf = [bestWeekday, bestWindow].filter((b) => b.best).map((b) => b.confidence);
    recs.push({
      area: "timing",
      text: `Your posts did best ${parts}. Consider moving calendar slots there (growth_calendar generate with use_analytics_windows).`,
      confidence: conf.includes("low") ? "low" : conf.includes("medium") ? "medium" : "high",
      evidence: [bestWeekday.best ? `${bestWeekday.best.key} ${bestWeekday.best.sample}` : null, bestWindow.best ? `${bestWindow.best.key} ${bestWindow.best.sample}` : null].filter(Boolean).join("; "),
    });
  }
  const withReactions = compared.filter((v) => (v.reactions ?? 0) > 0);
  if (withReactions.length >= ANALYTICS_RULES.min_group_n) {
    const ratio = median(withReactions.map((v) => (v.comments ?? 0) / (v.reactions ?? 1)));
    if (ratio !== null && ratio < ANALYTICS_RULES.low_comments_per_reaction) {
      recs.push({
        area: "conversation",
        text: `Posts earn reactions but few comments (median ${Math.round(ratio * 100)} comments per 100 reactions). End with a specific, answerable question and reply to early comments within the first hour.`,
        confidence: confidenceFor(withReactions.length),
        evidence: sampleNote(withReactions.length),
      });
    }
  }
  const planPerWeek = input.strategy?.cadence?.posts_per_week;
  const actual = summary.posts_per_week_last_28_days;
  if (planPerWeek && actual !== null && actual < planPerWeek * 0.75) {
    recs.push({
      area: "cadence",
      text: `You're posting about ${actual} times a week against ${planPerWeek} planned. Consistency matters more than volume: lower the plan or batch-draft a week ahead.`,
      confidence: "medium",
      evidence: "posts with a known date in the last 28 days",
    });
  }
  const growth = growthTrends(profile, fromDay);
  const followers = growth.followers;
  if (followers && "per_week" in followers && followers.days >= 7 && (followers.per_week ?? 0) <= 0) {
    recs.push({
      area: "audience",
      text: `Followers haven't grown over the last ${followers.days} days (${followers.change >= 0 ? "+" : ""}${followers.change}). Shift some posts to TOF pillars and spend the engagement minutes commenting on larger accounts in your niche.`,
      confidence: followers.days >= 21 ? "medium" : "low",
      evidence: `dashboard ${followers.first.day} → ${followers.last.day}`,
    });
  }
  const kpis = kpiReports(input, views, profile);
  for (const k of kpis.filter((x) => x.status === "behind")) {
    recs.push({
      area: "kpi",
      text: `"${k.name}" is behind: ${k.progress_pct}% of the way to ${k.target} with ${k.time_elapsed_pct}% of the time gone. Decide with the user whether to change tactics or the target at the next strategy review.`,
      confidence: "medium",
      evidence: `current ${k.current}, baseline ${k.baseline}`,
    });
  }

  return {
    window: { days: input.window_days, from: fromDay, to: localDayKey(now) },
    definitions: DEFINITIONS,
    summary,
    posts: views.slice(0, 20).map((v) => ({
      url: v.url,
      posted_at: v.posted_at,
      first_line: v.first_line,
      impressions: v.impressions,
      engagement_rate_pct: pct(v.er, 2),
      comment_rate_pct: pct(v.cr, 2),
      reactions: v.reactions,
      comments: v.comments,
      reposts: v.reposts,
      followers_gained: v.followers_gained,
      pillar: v.pillar,
      method: v.method_source === "inferred" ? `${v.method} (inferred)` : v.method,
      format: v.format,
      hook_type: v.hook_type,
      slot_id: v.slot_id,
      settled: v.settled,
    })),
    breakdowns,
    best_and_worst,
    timing: { best_weekday: bestWeekday, best_time_window: bestWindow, suggested_time_windows: suggested, note: timingNote },
    audience_growth: growth,
    kpis,
    recommendations: recs,
    notes,
  };
}

/** Time windows the history supports, for planning. Empty when the sample is too small. */
export function suggestedWindows(records: HistoryRecord[], slots: Slot[], ideas: Idea[], now: Date): { windows: TimeWindow[]; evidence: string } {
  const report = buildReport({ records, slots, ideas, strategy: null, strategy_start: null, now, window_days: 365 });
  const groups = report.breakdowns.time_windows.filter((g) => report.timing.suggested_time_windows.some((w) => windowFromLabel(g.key)?.start === w.start));
  return { windows: report.timing.suggested_time_windows, evidence: groups.map((g) => `${g.key} ${g.sample}, ${g.lift_pct}% above median`).join("; ") || report.timing.note };
}
