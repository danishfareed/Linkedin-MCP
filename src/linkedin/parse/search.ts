import type { Snapshot } from "../snapshot.js";
import { cleanLink } from "../urls.js";
import { cleanText, degree, lines, parseCount } from "./text.js";

export interface PersonResult {
  name: string | null;
  headline: string | null;
  location: string | null;
  profile_url: string | null;
  degree: "1st" | "2nd" | "3rd+" | null;
}

export interface CompanyResult {
  name: string | null;
  subtitle: string | null;
  followers: number | null;
  url: string | null;
}

const SKIP = /^(connect|message|follow|following|pending|view .+ profile|status is (online|offline|reachable)|\d+ mutual connections?|.+ (and \d+ other )?mutual connections?|.+ is a mutual connection|current:|past:|summary:|skills:|provides services|•\s*(1st|2nd|3rd\+?))$/i;

export function parsePersonResult(s: Snapshot): PersonResult | null {
  const href = s.attrs.link ?? s.links.find((l) => /\/in\//.test(l.href))?.href ?? null;
  const url = cleanLink(href);
  if (!url || !/\/in\//.test(url)) return null; // "LinkedIn Member" results without a profile are skipped

  const ls = lines(s.text).filter((l) => !SKIP.test(l));
  const name = cleanText(s.fields.name) ?? ls[0] ?? null;
  const rest = ls.filter((l) => l !== name && !/^(•\s*)?(1st|2nd|3rd\+?)( degree connection)?$/i.test(l));
  return {
    name: name?.replace(/\s*•\s*(1st|2nd|3rd\+?)$/i, "") ?? null,
    headline: cleanText(s.fields.headline) ?? rest[0] ?? null,
    location: cleanText(s.fields.location) ?? rest[1] ?? null,
    profile_url: url,
    degree: degree(s.fields.degree) ?? degree(s.text.slice(0, 200)),
  };
}

export function parseCompanyResult(s: Snapshot): CompanyResult | null {
  const href = s.attrs.link ?? s.links.find((l) => /\/company\/|\/school\/|\/showcase\//.test(l.href))?.href ?? null;
  const url = cleanLink(href);
  if (!url || !/\/(company|school|showcase)\//.test(url)) return null;
  const ls = lines(s.text).filter((l) => !/^(follow|following|view page)$/i.test(l));
  const name = cleanText(s.fields.name) ?? ls[0] ?? null;
  const followersLine = cleanText(s.fields.followers) ?? ls.find((l) => /followers/i.test(l)) ?? null;
  return {
    name,
    subtitle: cleanText(s.fields.subtitle) ?? ls.find((l) => l !== name && !/followers/i.test(l)) ?? null,
    followers: followersLine ? parseCount(followersLine) : null,
    url,
  };
}

export function parseResults<T extends { profile_url?: string | null; url?: string | null }>(
  snapshots: Snapshot[],
  parse: (s: Snapshot) => T | null,
  limit: number,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const s of snapshots) {
    const r = parse(s);
    if (!r) continue;
    const key = r.profile_url ?? r.url ?? JSON.stringify(r);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}
