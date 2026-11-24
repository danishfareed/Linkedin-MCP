import type { Snapshot } from "../snapshot.js";
import { BASE, cleanLink } from "../urls.js";
import { cleanBody, cleanText, countByKeyword, isNoise, lines, parseCount, relativeTime } from "./text.js";

export interface Author {
  name: string | null;
  headline: string | null;
  profile_url: string | null;
}

export interface Post {
  urn: string | null;
  url: string | null;
  author: Author;
  /** e.g. "Jane Doe reposted this", "Promoted". */
  context: string | null;
  posted: string | null;
  text: string | null;
  reactions: number | null;
  comments: number | null;
  reposts: number | null;
  impressions: number | null;
  promoted: boolean;
}

/** The post URN in a data attribute, a /feed/update/ link or a /posts/…-activity-123-… slug. */
export function postUrnIn(value: string | null | undefined): string | null {
  if (!value) return null;
  let s = value;
  try {
    s = decodeURIComponent(value);
  } catch {
    // malformed escape: match the raw value
  }
  const m = /urn:li:(activity|share|ugcPost):(\d{8,25})/.exec(s);
  if (m) return `urn:li:${m[1]}:${m[2]}`;
  const slug = /-(activity|share|ugcPost)-(\d{8,25})(?:-|\/|\?|$)/.exec(s);
  return slug ? `urn:li:${slug[1]}:${slug[2]}` : null;
}

/**
 * Pairs a post with its own URL. In order: a URN on the container itself, the
 * container's permalink (timestamp link), a link whose text is a timestamp,
 * a URN nested inside the container, then any post link in it. A nested URN or
 * a stray link can belong to a reshared or linked post, so they come last.
 */
function urnFrom(snapshot: Snapshot): string | null {
  const a = snapshot.attrs;
  // Specs that capture the container's own attributes let us tell its URN from a nested one.
  const knowsOwnAttrs = "selfUrn" in a || "selfId" in a;
  const own = knowsOwnAttrs ? postUrnIn(a.selfUrn) ?? postUrnIn(a.selfId) : postUrnIn(snapshot.urn);
  if (own) return own;
  const timeLinks = snapshot.links.filter((l) => relativeTime(l.text) && l.text.length <= 40).map((l) => l.href);
  for (const c of [a.postLink, ...timeLinks, snapshot.urn, ...snapshot.links.map((l) => l.href)]) {
    const urn = postUrnIn(c);
    if (urn) return urn;
  }
  return null;
}

/** The author's profile link. Prefers a link named after the author, so a repost doesn't get the reposter's link. */
function authorLink(snapshot: Snapshot, name: string | null): string | null {
  const direct = cleanLink(snapshot.attrs.actorLink);
  if (direct) return direct;
  const profiles = snapshot.links.filter((l) => /linkedin\.com\/(in|company)\//.test(l.href) || /^\/(in|company)\//.test(l.href));
  const link = (name ? profiles.find((l) => cleanText(l.text) === name) : undefined) ?? profiles[0];
  return link ? cleanLink(link.href) : null;
}

/** Fallback when the field selectors miss: read the post from its visible lines. */
function fromLines(text: string): { name: string | null; headline: string | null; posted: string | null; body: string | null; context: string | null } {
  const ls = lines(text).filter((l) => !/^feed post( number \d+)?$/i.test(l));
  let i = 0;
  let context: string | null = null;
  if (ls[0] && /\b(reposted|likes|loves|celebrates|commented on|supports|finds .* (insightful|funny)|follows)\b/i.test(ls[0])) {
    context = ls[0];
    i = 1;
  }
  const name = ls[i] ?? null;
  // degree badge and "Follow" can sit between name and headline
  let j = i + 1;
  while (ls[j] && (/^[•·]\s?(1st|2nd|3rd\+?|following|you)$/i.test(ls[j]!) || isNoise(ls[j]!) || /^(1st|2nd|3rd\+?)$/i.test(ls[j]!))) j++;
  const headline = ls[j] ?? null;
  let k = j + 1;
  let posted: string | null = null;
  while (k < ls.length && k < j + 4) {
    const t = relativeTime(ls[k]);
    if (t && /•|ago|^\d/.test(ls[k]!)) {
      posted = ls[k]!.replace(/\s*•\s*$/, "").replace(/\s*•.*$/, "").trim() || t;
      k++;
      break;
    }
    k++;
  }
  if (!posted) k = j + 1;
  const body: string[] = [];
  for (; k < ls.length; k++) {
    const l = ls[k]!;
    if (/^\d[\d,.]*\s*[kKmM]?$/.test(l) || /^\d[\d,.]*\s*[kKmM]?\s+(comments?|reposts?|reactions?|impressions?)$/i.test(l)) break;
    if (/^(like|comment|repost|send)$/i.test(l)) break;
    if (isNoise(l) || /^(follow|\+ follow)$/i.test(l)) continue;
    body.push(l);
  }
  return { name, headline, posted, body: cleanBody(body.join("\n")), context };
}

export function parsePost(snapshot: Snapshot): Post {
  const f = snapshot.fields;
  const fallback = fromLines(snapshot.text);
  const urn = urnFrom(snapshot);
  const labelSources = [...snapshot.labels, f.reactions, f.comments, f.reposts, f.impressions, ...lines(snapshot.text)];

  const reactions = parseCount(f.reactions) ?? countByKeyword(labelSources, /reactions?/);
  const comments = countByKeyword([f.comments, ...labelSources], /comments?/);
  const reposts = countByKeyword([f.reposts, ...labelSources], /reposts?/);
  const impressions = countByKeyword([f.impressions, ...labelSources], /(impressions?|views?)/);

  const context = cleanText(f.header) ?? fallback.context;
  const postedRaw = cleanText(f.actorTime);
  const posted = postedRaw ? postedRaw.split("•")[0]!.trim() || relativeTime(postedRaw) : fallback.posted;
  const name = cleanText(f.actorName) ?? fallback.name;

  return {
    urn,
    url: urn ? `${BASE}/feed/update/${urn}/` : null,
    author: {
      name,
      headline: cleanText(f.actorHeadline) ?? fallback.headline,
      profile_url: authorLink(snapshot, name),
    },
    context,
    posted,
    text: cleanBody(f.text) ?? fallback.body,
    reactions,
    comments,
    reposts,
    impressions,
    promoted: /\bpromoted\b/i.test(f.actorTime ?? "") || /^promoted$/im.test(snapshot.text),
  };
}

function contentKey(post: Post): string {
  return `${post.author.name ?? ""}|${(post.text ?? "").slice(0, 80)}`;
}

/** Stable identity for merging posts read across scrolls. */
export function postKey(post: Post): string {
  return post.urn ?? contentKey(post);
}

/** Same author and the same opening words: a repeat of the same post, not a different one. */
function samePost(a: Post, b: Post): boolean {
  if (a.author.name && b.author.name && a.author.name !== b.author.name) return false;
  const ta = a.text ?? "";
  const tb = b.text ?? "";
  if (!ta || !tb) return true;
  const n = Math.min(40, ta.length, tb.length);
  return ta.slice(0, n) === tb.slice(0, n);
}

/**
 * Parse, drop empties and duplicates (LinkedIn repeats reshared posts), respect the limit.
 * If two different posts end up with the same URN, the link belonged to only one
 * of them, so the later one keeps its content but loses the URL rather than
 * being dropped or pointing at someone else's post.
 */
export function parsePosts(snapshots: Snapshot[], limit: number, opts: { includePromoted?: boolean } = {}): Post[] {
  const byUrn = new Map<string, Post>();
  const seenContent = new Set<string>();
  const out: Post[] = [];
  for (const s of snapshots) {
    let post = parsePost(s);
    if (!post.text && !post.author.name) continue;
    if (post.promoted && !opts.includePromoted) continue;
    if (seenContent.has(contentKey(post))) continue;
    if (post.urn) {
      const earlier = byUrn.get(post.urn);
      if (earlier && samePost(earlier, post)) continue;
      if (earlier) post = { ...post, urn: null, url: null };
      else byUrn.set(post.urn, post);
    }
    seenContent.add(contentKey(post));
    out.push(post);
    if (out.length >= limit) break;
  }
  return out;
}
