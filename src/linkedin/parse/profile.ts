import type { Snapshot } from "../snapshot.js";
import { cleanBody, cleanText, lines, parseCount } from "./text.js";

export const PROFILE_SECTIONS = ["about", "experience", "education", "skills", "certifications", "languages", "volunteering", "projects"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];

export interface ProfileEntry {
  title: string | null;
  subtitle: string | null;
  dates: string | null;
  location: string | null;
  description: string | null;
}

export interface Profile {
  name: string | null;
  headline: string | null;
  location: string | null;
  connections: string | null;
  followers: number | null;
  profile_url: string | null;
  about?: string | null;
  experience?: ProfileEntry[];
  education?: ProfileEntry[];
  skills?: string[];
  certifications?: ProfileEntry[];
  languages?: ProfileEntry[];
  volunteering?: ProfileEntry[];
  projects?: ProfileEntry[];
}

const DATE_RANGE = /\b((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}\s*[-–—]\s*(present|((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4})\b/i;
const SINGLE_DATE = /^((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+)?\d{4}$|^issued\s/i;
const UI_LINE = /^(show all|see all|show credential|endorse|endorsed by|\d+ endorsements?|…see more|see more|see less|skills?:|show \d+ more)/i;

/** One experience/education/etc item, from its visible lines. */
export function parseEntry(text: string): ProfileEntry {
  const ls = lines(text).filter((l) => !UI_LINE.test(l));
  const title = ls[0] ?? null;
  let subtitle: string | null = null;
  let dates: string | null = null;
  let location: string | null = null;
  const rest: string[] = [];
  for (let i = 1; i < ls.length; i++) {
    const l = ls[i]!;
    if (!dates && (DATE_RANGE.test(l) || SINGLE_DATE.test(l))) {
      dates = l;
      continue;
    }
    if (!subtitle && !dates && i === 1) {
      subtitle = l;
      continue;
    }
    if (dates && !location && rest.length === 0 && l.length <= 80 && /,|remote|hybrid|on-site|area\b/i.test(l)) {
      location = l;
      continue;
    }
    rest.push(l);
  }
  return { title, subtitle, dates, location, description: cleanBody(rest.join("\n")) };
}

function sectionKey(s: Snapshot): string | null {
  const anchor = s.attrs.anchor?.toLowerCase();
  if (anchor) {
    const known = PROFILE_SECTIONS.find((k) => anchor === k || anchor.startsWith(k) || (k === "certifications" && anchor.startsWith("licenses")) || (k === "volunteering" && anchor.startsWith("volunteer")));
    if (known) return known;
  }
  const heading = cleanText(s.fields.heading)?.toLowerCase() ?? lines(s.text)[0]?.toLowerCase();
  if (!heading) return null;
  if (heading.startsWith("licenses") || heading.startsWith("certifications")) return "certifications";
  if (heading.startsWith("volunteer")) return "volunteering";
  return PROFILE_SECTIONS.find((k) => heading.startsWith(k)) ?? null;
}

function entriesOf(s: Snapshot): ProfileEntry[] {
  const texts = s.items.length ? s.items : [];
  return texts.map(parseEntry).filter((e) => e.title);
}

export function parseProfile(top: Snapshot, sections: Snapshot[], wanted: readonly ProfileSection[], profileUrl: string | null): Profile {
  const f = top.fields;
  const topLines = lines(top.text);
  const name = cleanText(f.name) ?? topLines[0] ?? null;
  const profile: Profile = {
    name,
    headline: cleanText(f.headline) ?? (name ? topLines[topLines.indexOf(name) + 1] ?? null : null),
    location: cleanText(f.location),
    connections: cleanText(f.connections)?.replace(/\s*connections?$/i, "") ?? null,
    followers: parseCount(f.followers),
    profile_url: profileUrl,
  };

  const byKey = new Map<string, Snapshot>();
  for (const s of sections) {
    const key = sectionKey(s);
    if (key && !byKey.has(key)) byKey.set(key, s);
  }

  for (const key of wanted) {
    const s = byKey.get(key);
    if (key === "about") {
      if (!s) {
        profile.about = null;
        continue;
      }
      const about = cleanBody(s.fields.about) ?? cleanBody(lines(s.text).filter((l) => l.toLowerCase() !== "about").join("\n"));
      profile.about = about;
      continue;
    }
    if (key === "skills") {
      profile.skills = s ? s.items.map((t) => lines(t).filter((l) => !UI_LINE.test(l))[0]).filter((x): x is string => Boolean(x)) : [];
      continue;
    }
    profile[key] = s ? entriesOf(s) : [];
  }
  return profile;
}
