import type { Snapshot } from "../snapshot.js";
import { type Post, parsePosts } from "./feed.js";

/** What an item on a recent-activity page or a company's posts tab is. */
export type ActivityKind = "post" | "repost" | "comment" | "reaction" | "other";

export interface ActivityPost extends Post {
  /** "post" for the owner's own post, "repost" when they reshared someone else's. */
  kind: "post" | "repost" | "other";
}

export function activityKind(post: Post): ActivityKind {
  const c = (post.context ?? "").toLowerCase();
  if (!c) return "post";
  if (/\breposted\b/.test(c)) return "repost";
  if (/\b(commented on|replied to)\b/.test(c)) return "comment";
  if (/\b(likes|loves|celebrates|supports|reacted to|finds .* (insightful|funny|curious))\b/.test(c)) return "reaction";
  return "other";
}

/**
 * Posts and reposts from an activity page. Comments and reactions are dropped:
 * the text under them is someone else's post, and attributing it to the
 * profile owner would be wrong.
 */
export function parseActivityPosts(snapshots: Snapshot[], limit: number): ActivityPost[] {
  const out: ActivityPost[] = [];
  for (const post of parsePosts(snapshots, Number.MAX_SAFE_INTEGER, { includePromoted: false })) {
    const kind = activityKind(post);
    if (kind === "comment" || kind === "reaction") continue;
    out.push({ ...post, kind });
    if (out.length >= limit) break;
  }
  return out;
}
