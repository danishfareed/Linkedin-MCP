import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname } from "node:path";
import type { Post } from "../../linkedin/parse/feed.js";
import type { Metric } from "../../linkedin/parse/analytics.js";
import { withFileLock } from "../../state/store.js";
import { localDayKey } from "../../util/time.js";
import { estimatePostedAt, postedAtFromUrn } from "./math.js";

/**
 * analytics/history.jsonl: one JSON object per line, appended as dated
 * snapshots. At most one record per post per day (and one profile record per
 * day): a later read on the same day updates that day's record instead of
 * adding another, so the file stays a clean daily series.
 */

export interface PostSnapshot {
  kind: "post";
  /** The post URN, or text:<hash> when LinkedIn showed no URN. */
  key: string;
  /** Local day of capture, YYYY-MM-DD. */
  day: string;
  captured_at: string;
  urn: string | null;
  url: string | null;
  posted_at: string | null;
  /** urn: decoded from the post id (exact); calendar: from the slot; relative: estimated from "3d" (day-level at best). */
  posted_at_source: "urn" | "calendar" | "relative" | null;
  posted_relative: string | null;
  first_line: string | null;
  /** The text as read from the activity page; it may stop at LinkedIn's fold. */
  text: string | null;
  impressions: number | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  /** From get_post_analytics, when it was read. */
  members_reached?: number | null;
  profile_viewers?: number | null;
  followers_gained?: number | null;
  saves?: number | null;
  sends?: number | null;
  sources: ("my_posts" | "post_analytics")[];
}

export interface ProfileSnapshot {
  kind: "profile";
  key: "profile";
  day: string;
  captured_at: string;
  post_impressions: number | null;
  followers: number | null;
  profile_viewers: number | null;
  search_appearances: number | null;
  /** The trend text LinkedIn shows next to each, e.g. "18.2% past 7 days". */
  changes: Record<string, string | null>;
}

export type HistoryRecord = PostSnapshot | ProfileSnapshot;

function recordId(r: Pick<HistoryRecord, "kind" | "key" | "day">): string {
  return `${r.kind}|${r.key}|${r.day}`;
}

function textKey(text: string | null): string {
  const norm = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  return `text:${createHash("sha256").update(norm).digest("hex").slice(0, 16)}`;
}

export function firstLineOf(text: string | null | undefined): string | null {
  return (text ?? "").split("\n").map((l) => l.trim()).find(Boolean) ?? null;
}

/** A repost of someone else's post isn't the user's content. */
export function isRepost(post: Pick<Post, "context">): boolean {
  return /\breposted\b/i.test(post.context ?? "");
}

export function postSnapshot(post: Post, now: Date): PostSnapshot {
  const fromUrn = postedAtFromUrn(post.urn, now);
  const estimated = fromUrn ? null : estimatePostedAt(post.posted, now);
  return {
    kind: "post",
    key: post.urn ?? textKey(post.text),
    day: localDayKey(now),
    captured_at: now.toISOString(),
    urn: post.urn,
    url: post.url,
    posted_at: (fromUrn ?? estimated)?.toISOString() ?? null,
    posted_at_source: fromUrn ? "urn" : estimated ? "relative" : null,
    posted_relative: post.posted,
    first_line: firstLineOf(post.text),
    text: post.text,
    impressions: post.impressions,
    reactions: post.reactions,
    comments: post.comments,
    reposts: post.reposts,
    sources: ["my_posts"],
  };
}

const value = (metrics: Record<string, Metric>, label: string) => metrics[label]?.value ?? null;

/** Adds get_post_analytics numbers to a post snapshot. LinkedIn's analytics page wins over the activity page counts. */
export function withPostAnalytics(s: PostSnapshot, metrics: Record<string, Metric>): PostSnapshot {
  const pick = (label: string, fallback: number | null) => value(metrics, label) ?? fallback;
  return {
    ...s,
    impressions: pick("Impressions", s.impressions),
    reactions: pick("Reactions", s.reactions),
    comments: pick("Comments", s.comments),
    reposts: pick("Reposts", s.reposts),
    members_reached: value(metrics, "Members reached"),
    profile_viewers: value(metrics, "Profile viewers from this post"),
    followers_gained: value(metrics, "Followers gained from this post"),
    saves: value(metrics, "Saves"),
    sends: value(metrics, "Sends on LinkedIn"),
    sources: [...new Set([...s.sources, "post_analytics" as const])],
  };
}

export function profileSnapshot(metrics: Record<string, Metric>, now: Date): ProfileSnapshot {
  return {
    kind: "profile",
    key: "profile",
    day: localDayKey(now),
    captured_at: now.toISOString(),
    post_impressions: value(metrics, "Post impressions"),
    followers: value(metrics, "Followers"),
    profile_viewers: value(metrics, "Profile viewers"),
    search_appearances: value(metrics, "Search appearances"),
    changes: Object.fromEntries(Object.entries(metrics).map(([k, m]) => [k, m.change])),
  };
}

/** Same-day merge: newer non-null values win, older values fill gaps. */
export function mergeRecord<T extends HistoryRecord>(older: T, newer: T): T {
  const out: Record<string, unknown> = { ...older };
  for (const [k, v] of Object.entries(newer)) {
    if (v === null || v === undefined) continue;
    if (k === "sources" && Array.isArray(v)) out[k] = [...new Set([...((older as PostSnapshot).sources ?? []), ...v])];
    else if (k === "changes" && typeof v === "object") out[k] = { ...(older as ProfileSnapshot).changes, ...v };
    else out[k] = v;
  }
  return out as T;
}

function isRecord(x: unknown): x is HistoryRecord {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (r.kind === "post" || r.kind === "profile") && typeof r.key === "string" && typeof r.day === "string";
}

export interface ParsedHistory {
  records: HistoryRecord[];
  /** Lines that weren't valid records (kept in the file, ignored here). */
  skipped_lines: number;
}

export function parseHistory(raw: string): ParsedHistory {
  const records: HistoryRecord[] = [];
  let skipped = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const obj: unknown = JSON.parse(line);
      if (isRecord(obj)) records.push(obj);
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { records, skipped_lines: skipped };
}

export async function readHistory(file: string): Promise<ParsedHistory> {
  try {
    return parseHistory(await fs.readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { records: [], skipped_lines: 0 };
    throw err;
  }
}

/**
 * Pure: folds incoming records into existing ones, one per (kind, key, day).
 * `replaced` is true when an existing line changed, so the file must be rewritten.
 */
export function mergeHistory(existing: HistoryRecord[], incoming: HistoryRecord[]): { records: HistoryRecord[]; added: number; updated: number; replaced: boolean } {
  const records = [...existing];
  const index = new Map(records.map((r, i) => [recordId(r), i]));
  let added = 0;
  let updated = 0;
  let replaced = false;
  for (const r of incoming) {
    const id = recordId(r);
    const at = index.get(id);
    if (at === undefined) {
      index.set(id, records.length);
      records.push(r);
      added++;
      continue;
    }
    const merged = mergeRecord(records[at]!, r);
    if (JSON.stringify(merged) !== JSON.stringify(records[at])) {
      records[at] = merged;
      updated++;
      if (at < existing.length) replaced = true;
    }
  }
  return { records, added, updated, replaced };
}

/** Saves snapshots under the file lock: appends new lines, or rewrites atomically when a same-day record changed. */
export async function saveSnapshots(file: string, incoming: HistoryRecord[]): Promise<{ added: number; updated: number }> {
  if (!incoming.length) return { added: 0, updated: 0 };
  return withFileLock(file, async () => {
    await fs.mkdir(dirname(file), { recursive: true, mode: 0o700 });
    let raw = "";
    try {
      raw = await fs.readFile(file, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    const { records: existing, skipped_lines } = parseHistory(raw);
    const result = mergeHistory(existing, incoming);
    if (result.replaced) {
      // A rewrite would drop lines that aren't records; keep a copy of the old file rather than lose them.
      if (skipped_lines) await fs.copyFile(file, `${file}.invalid-lines-${Date.now()}`);
      const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
      await fs.writeFile(tmp, result.records.map((r) => JSON.stringify(r)).join("\n") + "\n", { mode: 0o600 });
      try {
        await fs.rename(tmp, file);
      } catch (err) {
        await fs.rm(tmp, { force: true });
        throw err;
      }
    } else {
      const fresh = result.records.slice(existing.length);
      if (fresh.length) await fs.appendFile(file, fresh.map((r) => JSON.stringify(r)).join("\n") + "\n", { mode: 0o600 });
    }
    return { added: result.added, updated: result.updated };
  });
}

/** The latest snapshot of each post (by capture time), and profile snapshots one per day. */
export function latestByPost(records: HistoryRecord[]): { posts: PostSnapshot[]; profile: ProfileSnapshot[] } {
  const posts = new Map<string, PostSnapshot>();
  const profile = new Map<string, ProfileSnapshot>();
  const ordered = [...records].sort((a, b) => a.captured_at.localeCompare(b.captured_at));
  for (const r of ordered) {
    if (r.kind === "post") {
      const prev = posts.get(r.key);
      posts.set(r.key, prev ? mergeRecord(prev, r) : r);
    } else {
      const prev = profile.get(r.day);
      profile.set(r.day, prev ? mergeRecord(prev, r) : r);
    }
  }
  return { posts: [...posts.values()], profile: [...profile.values()].sort((a, b) => a.day.localeCompare(b.day)) };
}
