import type { Snapshot } from "../snapshot.js";
import { cleanBody, cleanText, lines, parseCount } from "./text.js";

export interface Company {
  name: string | null;
  tagline: string | null;
  overview: string | null;
  website: string | null;
  industry: string | null;
  company_size: string | null;
  headquarters: string | null;
  founded: string | null;
  specialties: string | null;
  followers: number | null;
  url: string;
}

const LABELS: Record<string, keyof Company> = {
  website: "website",
  industry: "industry",
  "company size": "company_size",
  headquarters: "headquarters",
  founded: "founded",
  specialties: "specialties",
};

/** Read "Label\nValue" pairs from the About details list. */
export function labelPairs(text: string): Record<string, string> {
  const ls = lines(text);
  const out: Record<string, string> = {};
  for (let i = 0; i < ls.length - 1; i++) {
    const label = ls[i]!.toLowerCase().replace(/:$/, "");
    if (label in LABELS && !(label in out)) {
      const value = ls[i + 1]!;
      if (!(value.toLowerCase() in LABELS)) out[label] = value;
    }
  }
  return out;
}

export function parseCompany(snapshot: Snapshot, url: string): Company {
  const f = snapshot.fields;
  const all = lines(snapshot.text);
  const pairs = { ...labelPairs(snapshot.text), ...labelPairs(f.details ?? "") };

  let overview = cleanBody(f.overview);
  if (!overview) {
    const i = all.findIndex((l) => l.toLowerCase() === "overview");
    if (i >= 0) {
      const body: string[] = [];
      for (let j = i + 1; j < all.length && !(all[j]!.toLowerCase() in LABELS); j++) body.push(all[j]!);
      overview = cleanBody(body.join("\n"));
    }
  }
  const followersLine = [f.info, ...all].find((l) => l && /followers/i.test(l)) ?? null;
  const followersMatch = followersLine ? /([\d,.]+\s*[KkMm]?)\s+followers/.exec(followersLine) : null;

  return {
    name: cleanText(f.name) ?? all[0] ?? null,
    tagline: cleanText(f.tagline),
    overview,
    website: pairs.website ?? null,
    industry: pairs.industry ?? null,
    company_size: pairs["company size"] ?? null,
    headquarters: pairs.headquarters ?? null,
    founded: pairs.founded ?? null,
    specialties: pairs.specialties ?? null,
    followers: followersMatch ? parseCount(followersMatch[1]) : null,
    url,
  };
}
