import type { Snapshot } from "../snapshot.js";
import { cleanLink } from "../urls.js";
import type { Author } from "./feed.js";
import { cleanBody, cleanText, countByKeyword, degree, lines, parseCount, relativeTime } from "./text.js";

export interface Comment {
  /** Comment URN, used as comment_id by reply_to_comment. */
  id: string | null;
  author: Author;
  text: string | null;
  posted: string | null;
  reactions: number | null;
  is_reply: boolean;
}

function commentUrn(snapshot: Snapshot): string | null {
  if (!snapshot.urn) return null;
  const m = /urn:li:comment:\([^)]+\)/.exec(snapshot.urn);
  return m ? m[0] : snapshot.urn.startsWith("urn:li:comment:") ? snapshot.urn : null;
}

function fromLines(text: string): { name: string | null; headline: string | null; posted: string | null; body: string | null } {
  const ls = lines(text);
  const name = ls[0] ?? null;
  let i = 1;
  while (ls[i] && (degree(ls[i]) && ls[i]!.length < 20 || /^(author|•)$/i.test(ls[i]!))) i++;
  const headline = ls[i] ?? null;
  let posted: string | null = null;
  let j = i + 1;
  for (; j < Math.min(ls.length, i + 4); j++) {
    if (relativeTime(ls[j]) && ls[j]!.length < 25) {
      posted = relativeTime(ls[j]);
      j++;
      break;
    }
  }
  if (!posted) j = i + 1;
  const body: string[] = [];
  for (; j < ls.length; j++) {
    if (/^(like|reply|\d+\s+repl(y|ies)|load previous replies|see previous replies)$/i.test(ls[j]!)) break;
    if (/^\d+$/.test(ls[j]!) && /^(like|reply)$/i.test(ls[j + 1] ?? "")) break;
    body.push(ls[j]!);
  }
  return { name, headline, posted, body: cleanBody(body.join("\n")) };
}

export function parseComment(snapshot: Snapshot): Comment {
  const f = snapshot.fields;
  const fb = fromLines(snapshot.text);
  const authorHref = snapshot.attrs.authorLink ?? snapshot.links.find((l) => /\/in\/|\/company\//.test(l.href))?.href;
  return {
    id: commentUrn(snapshot),
    author: {
      name: cleanText(f.author)?.replace(/\s*•\s*(1st|2nd|3rd\+?|Author)\s*$/i, "") ?? fb.name,
      headline: cleanText(f.headline) ?? fb.headline,
      profile_url: cleanLink(authorHref),
    },
    text: cleanBody(f.text) ?? fb.body,
    posted: relativeTime(f.time) ?? cleanText(f.time) ?? fb.posted,
    reactions: parseCount(f.reactions) ?? countByKeyword(snapshot.labels, /reactions?/),
    is_reply: snapshot.depth > 0,
  };
}

export function parseComments(snapshots: Snapshot[], limit: number): Comment[] {
  const seen = new Set<string>();
  const out: Comment[] = [];
  for (const s of snapshots) {
    const c = parseComment(s);
    if (!c.text && !c.author.name) continue;
    const key = c.id ?? `${c.author.name}|${c.text?.slice(0, 80)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
