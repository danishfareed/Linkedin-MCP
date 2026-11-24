import type { TimeWindow } from "../workspace/schemas.js";

/**
 * Pure analytics math for growth_report. Every threshold is in
 * ANALYTICS_RULES with its basis; nothing here does I/O.
 *
 * Definitions:
 * - engagements = reactions + comments + reposts (a missing count is 0 when
 *   impressions are known, because LinkedIn hides zero counts)
 * - engagement rate = engagements / impressions
 * - comment rate = comments / impressions
 * - rates are only defined when impressions > 0
 */

export const ANALYTICS_RULES = {
  /** A group (pillar, weekday…) needs at least this many posts to be ranked at all. */
  min_group_n: 3,
  /** n < 5: low ("directional only"); 5-14: medium; 15+: high. */
  confidence: { medium_from: 5, high_from: 15 },
  /** Differences smaller than this (relative, in %) are reported as "no clear difference". */
  min_lift_pct: 20,
  /** Posts younger than this are still collecting impressions and are left out of comparisons. */
  settle_hours: 48,
  /** On-track if progress is within this many percentage points of the time elapsed. */
  kpi_on_track_margin_pts: 10,
  /** Comment rate below this share of reactions suggests asking a better question. */
  low_comments_per_reaction: 0.05,
  basis:
    "Rules of thumb, not statistics: with a handful of posts, LinkedIn's distribution varies more than any single factor, so groups under 3 posts aren't ranked, differences under 20% aren't called out, and confidence stays low until n ≥ 5. Posts under 48 hours old are excluded because most impressions arrive in the first days.",
} as const;

/** Local-time posting windows used to compare posting times. */
export const HOUR_WINDOWS: { label: string; start: number; end: number }[] = [
  { label: "00:00–06:00", start: 0, end: 6 },
  { label: "06:00–09:00", start: 6, end: 9 },
  { label: "09:00–12:00", start: 9, end: 12 },
  { label: "12:00–15:00", start: 12, end: 15 },
  { label: "15:00–18:00", start: 15, end: 18 },
  { label: "18:00–21:00", start: 18, end: 21 },
  { label: "21:00–24:00", start: 21, end: 24 },
];

export const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export type Confidence = "low" | "medium" | "high";

export interface Counts {
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
}

export function engagements(p: Counts): number {
  return (p.reactions ?? 0) + (p.comments ?? 0) + (p.reposts ?? 0);
}

export function engagementRate(p: Counts): number | null {
  if (!p.impressions || p.impressions <= 0) return null;
  return engagements(p) / p.impressions;
}

export function commentRate(p: Counts): number | null {
  if (!p.impressions || p.impressions <= 0) return null;
  return (p.comments ?? 0) / p.impressions;
}

/** Percent with one decimal, or null. */
export function pct(x: number | null | undefined, digits = 1): number | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const f = 10 ** digits;
  return Math.round(x * 100 * f) / f;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

export function confidenceFor(n: number): Confidence {
  if (n >= ANALYTICS_RULES.confidence.high_from) return "high";
  if (n >= ANALYTICS_RULES.confidence.medium_from) return "medium";
  return "low";
}

/** "n=4, directional only" for small samples, else "n=12". */
export function sampleNote(n: number): string {
  return confidenceFor(n) === "low" ? `n=${n}, directional only` : `n=${n}`;
}

export interface GroupStat {
  key: string;
  n: number;
  /** Median engagement rate, in percent. */
  median_er_pct: number | null;
  median_impressions: number | null;
  /** Median comment rate, in percent. */
  median_comment_rate_pct: number | null;
  /** Median ER compared with the overall median, in percent (+25 = 25% higher). */
  lift_pct: number | null;
  sample: string;
}

export interface Measured {
  er: number | null;
  cr: number | null;
  impressions: number | null;
}

/** Groups items by key and summarises each group. Items with a null key are left out. */
export function groupStats<T extends Measured>(items: T[], key: (item: T) => string | null | undefined): GroupStat[] {
  const overall = median(items.map((i) => i.er).filter((x): x is number => x !== null));
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), item]);
  }
  return [...groups.entries()]
    .map(([k, members]) => {
      const ers = members.map((m) => m.er).filter((x): x is number => x !== null);
      const med = median(ers);
      return {
        key: k,
        n: members.length,
        median_er_pct: pct(med, 2),
        median_impressions: median(members.map((m) => m.impressions).filter((x): x is number => x !== null)),
        median_comment_rate_pct: pct(median(members.map((m) => m.cr).filter((x): x is number => x !== null)), 2),
        lift_pct: med !== null && overall ? Math.round((med / overall - 1) * 100) : null,
        sample: sampleNote(members.length),
      };
    })
    .sort((a, b) => (b.median_er_pct ?? -1) - (a.median_er_pct ?? -1) || b.n - a.n);
}

export interface BestWorst {
  best: GroupStat | null;
  worst: GroupStat | null;
  confidence: Confidence;
  note: string;
}

/**
 * The best and worst of the groups big enough to rank. Confidence follows the
 * smaller of the two groups. Differences under min_lift_pct aren't called out.
 */
export function bestAndWorst(groups: GroupStat[], what: string): BestWorst {
  const rankable = groups.filter((g) => g.n >= ANALYTICS_RULES.min_group_n && g.median_er_pct !== null);
  if (rankable.length < 2) {
    const sizes = groups.map((g) => `${g.key} n=${g.n}`).join(", ");
    return { best: null, worst: null, confidence: "low", note: `Not enough data to compare ${what}: each needs at least ${ANALYTICS_RULES.min_group_n} posts${sizes ? ` (have ${sizes})` : ""}.` };
  }
  const best = rankable[0]!;
  const worst = rankable[rankable.length - 1]!;
  const n = Math.min(best.n, worst.n);
  const confidence = confidenceFor(n);
  const gap = worst.median_er_pct ? Math.round((best.median_er_pct! / worst.median_er_pct - 1) * 100) : null;
  if (gap !== null && gap < ANALYTICS_RULES.min_lift_pct) {
    return { best: null, worst: null, confidence, note: `No clear difference between ${what} (best ${best.key} vs worst ${worst.key}: ${gap}% apart; ${sampleNote(n)}).` };
  }
  return {
    best,
    worst,
    confidence,
    note: `${best.key} leads (${best.median_er_pct}% median engagement, ${best.sample}); ${worst.key} trails (${worst.median_er_pct}%, ${worst.sample}).${confidence === "low" ? " Directional only." : ""}`,
  };
}

// --- Dates ------------------------------------------------------------------

const EARLIEST_POST = Date.UTC(2015, 0, 1);

/**
 * LinkedIn post ids (activity, share, ugcPost) carry their creation time in
 * the top 41 bits, as milliseconds since the Unix epoch. Returns null for ids
 * that don't decode to a plausible date.
 */
export function postedAtFromUrn(urn: string | null | undefined, now: Date): Date | null {
  const m = urn ? /urn:li:(?:activity|share|ugcPost):(\d{15,25})/.exec(urn) : null;
  if (!m) return null;
  const ms = Number(BigInt(m[1]!) >> 22n);
  if (ms < EARLIEST_POST || ms > now.getTime() + 86_400_000) return null;
  return new Date(ms);
}

const RELATIVE_UNITS: Record<string, number> = { s: 1e3, m: 6e4, h: 36e5, d: 864e5, w: 6048e5, mo: 2592e6, y: 31536e6, yr: 31536e6 };

/** "3d" captured at T → roughly T − 3 days. Day-level precision at best. */
export function estimatePostedAt(relative: string | null | undefined, capturedAt: Date): Date | null {
  const m = relative ? /^(\d+)\s?(mo|yr|s|m|h|d|w|y)\b/i.exec(relative.trim()) : null;
  if (!m) return null;
  const unit = RELATIVE_UNITS[m[2]!.toLowerCase()];
  return unit ? new Date(capturedAt.getTime() - Number(m[1]) * unit) : null;
}

export function weekdayLabel(d: Date): string {
  return WEEKDAY_LABELS[(d.getDay() + 6) % 7]!;
}

export function hourWindowOf(d: Date): string {
  const h = d.getHours();
  return HOUR_WINDOWS.find((w) => h >= w.start && h < w.end)!.label;
}

export function windowFromLabel(label: string): TimeWindow | null {
  const w = HOUR_WINDOWS.find((x) => x.label === label);
  if (!w) return null;
  const hh = (n: number) => `${String(Math.min(n, 23)).padStart(2, "0")}:${n >= 24 ? "59" : "00"}`;
  return { start: hh(w.start), end: hh(w.end) };
}

// --- Trends and KPIs --------------------------------------------------------

export interface Trend {
  first: { day: string; value: number };
  last: { day: string; value: number };
  change: number;
  change_pct: number | null;
  days: number;
  per_week: number | null;
}

function dayDiff(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number) as [number, number, number];
  const [yb, mb, db] = b.split("-").map(Number) as [number, number, number];
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** First-to-last change over dated values (one per day, any order). Null with fewer than two days. */
export function trend(points: { day: string; value: number | null }[]): Trend | null {
  const ps = points.filter((p): p is { day: string; value: number } => p.value !== null).sort((a, b) => a.day.localeCompare(b.day));
  if (ps.length < 2) return null;
  const first = ps[0]!;
  const last = ps[ps.length - 1]!;
  const days = dayDiff(first.day, last.day);
  if (days <= 0) return null;
  const change = last.value - first.value;
  return {
    first,
    last,
    change,
    change_pct: first.value ? Math.round((change / first.value) * 1000) / 10 : null,
    days,
    per_week: Math.round((change / days) * 7 * 10) / 10,
  };
}

export type KpiStatus = "achieved" | "on_track" | "behind" | "no_data" | "past_due";

export interface KpiProgress {
  current: number | null;
  baseline: number | null;
  progress_pct: number | null;
  time_elapsed_pct: number | null;
  status: KpiStatus;
}

/**
 * Progress from baseline toward target, compared with the share of time
 * elapsed from `start` to the due date. Works for targets above or below
 * the baseline.
 */
export function kpiProgress(input: { target: number; current: number | null; baseline: number | null; start: Date; due: Date; now: Date }): KpiProgress {
  const { target, current, baseline, start, due, now } = input;
  const span = due.getTime() - start.getTime();
  const elapsed = span > 0 ? Math.min(1, Math.max(0, (now.getTime() - start.getTime()) / span)) : 1;
  const timePct = Math.round(elapsed * 100);
  if (current === null) return { current, baseline, progress_pct: null, time_elapsed_pct: timePct, status: "no_data" };
  const up = baseline === null || target >= baseline;
  if (up ? current >= target : current <= target) return { current, baseline, progress_pct: 100, time_elapsed_pct: timePct, status: "achieved" };
  if (baseline === null || baseline === target) return { current, baseline, progress_pct: null, time_elapsed_pct: timePct, status: now > due ? "past_due" : "no_data" };
  const progress = Math.round(((current - baseline) / (target - baseline)) * 100);
  if (now > due) return { current, baseline, progress_pct: progress, time_elapsed_pct: 100, status: "past_due" };
  const status: KpiStatus = progress >= timePct - ANALYTICS_RULES.kpi_on_track_margin_pts ? "on_track" : "behind";
  return { current, baseline, progress_pct: progress, time_elapsed_pct: timePct, status };
}
