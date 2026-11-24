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

function urnFrom(snapshot: Snapshot): string | null {
  const candidates = [snapshot.urn, snapshot.attrs.postLink, ...snapshot.links.map((l) => l.href)];
  for (const c of candidates) {
    if (!c) continue;
    const m = /urn:li:(activity|share|ugcPost):(\d+)/.exec(decodeURIComponent(c));
    if (m) return `urn:li:${m[1]}:${m[2]}`;
    const slug = /-activity-(\d+)-/.exec(c);
    if (slug) return `urn:li:activity:${slug[1]}`;
  }
  return null;
}

function authorLink(snapshot: Snapshot): string | null {
  const direct = cleanLink(snapshot.attrs.actorLink);
  if (direct) return direct;
  const link = snapshot.links.find((l) => /linkedin\.com\/(in|company)\//.test(l.href) || /^\/(in|company)\//.test(l.href));
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

  return {
    urn,
    url: urn ? `${BASE}/feed/update/${urn}/` : null,
    author: {
      name: cleanText(f.actorName) ?? fallback.name,
      headline: cleanText(f.actorHeadline) ?? fallback.headline,
      profile_url: authorLink(snapshot),
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

/** Parse, drop empties and duplicates (LinkedIn repeats reshared posts), respect the limit. */
export function parsePosts(snapshots: Snapshot[], limit: number, opts: { includePromoted?: boolean } = {}): Post[] {
  const seen = new Set<string>();
  const out: Post[] = [];
  for (const s of snapshots) {
    const post = parsePost(s);
    if (!post.text && !post.author.name) continue;
    if (post.promoted && !opts.includePromoted) continue;
    const key = post.urn ?? `${post.author.name}|${post.text?.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
    if (out.length >= limit) break;
  }
  return out;
}
