import { lines, parseCount } from "./text.js";

export interface Metric {
  value: number | null;
  /** e.g. "12.5% past 7 days", when LinkedIn shows a trend. */
  change: string | null;
}

const NUMERIC = /^[+-]?\d[\d,.\s]*\s*[kKmM]?$/;
const CHANGE = /^[+-]?\d[\d,.]*\s?%|^(no change|up|down)\b|past \d+ days|vs\.? prior|previous \d+ days/i;

function isNumeric(line: string | undefined): boolean {
  return Boolean(line && NUMERIC.test(line.trim()));
}

/**
 * Finds metric values next to their labels. LinkedIn sometimes renders the
 * number above the label and sometimes below it, so the orientation is
 * detected from the page as a whole before reading values.
 */
export function readMetrics(text: string, labels: string[]): Record<string, Metric> {
  const ls = lines(text);
  const index = (label: string) => ls.findIndex((l) => l.toLowerCase() === label.toLowerCase() || l.toLowerCase().startsWith(`${label.toLowerCase()} `));

  let before = 0;
  let after = 0;
  for (const label of labels) {
    const i = index(label);
    if (i < 0) continue;
    if (isNumeric(ls[i - 1])) before++;
    if (isNumeric(ls[i + 1])) after++;
  }
  const valueFirst = before >= after;

  const out: Record<string, Metric> = {};
  for (const label of labels) {
    const i = index(label);
    if (i < 0) {
      out[label] = { value: null, change: null };
      continue;
    }
    const primary = valueFirst ? ls[i - 1] : ls[i + 1];
    const secondary = valueFirst ? ls[i + 1] : ls[i - 1];
    const valueLine = isNumeric(primary) ? primary : isNumeric(secondary) ? secondary : undefined;
    // An inline value like "Impressions 1,234"
    const inline = valueLine ? undefined : /(\d[\d,.]*\s*[kKmM]?)\s*$/.exec(ls[i]!)?.[1];
    const changeLine = [ls[i + 1], ls[i + 2]].find((l) => l && CHANGE.test(l) && !isNumeric(l)) ?? null;
    out[label] = { value: parseCount(valueLine ?? inline), change: changeLine };
  }
  return out;
}

export interface Demographic {
  category: string;
  items: { label: string; share: string }[];
}

/** "Job titles\nSoftware Engineer\n12%\nProduct Manager\n8%" → grouped shares. */
export function readDemographics(text: string, categories: string[]): Demographic[] {
  const ls = lines(text);
  const out: Demographic[] = [];
  const catSet = new Set(categories.map((c) => c.toLowerCase()));
  for (let i = 0; i < ls.length; i++) {
    const cat = ls[i]!;
    if (!catSet.has(cat.toLowerCase())) continue;
    const items: Demographic["items"] = [];
    for (let j = i + 1; j < ls.length - 1 && items.length < 5; j++) {
      if (catSet.has(ls[j]!.toLowerCase())) break;
      const share = /^(\d{1,3}(\.\d)?%|<\s?1%)$/.exec(ls[j + 1]!);
      if (share && !/%$/.test(ls[j]!)) {
        items.push({ label: ls[j]!, share: share[1]! });
        j++;
      }
    }
    if (items.length) out.push({ category: cat, items });
  }
  return out;
}

export const PROFILE_METRICS = ["Post impressions", "Followers", "Profile viewers", "Search appearances"];

export const POST_METRICS = [
  "Impressions",
  "Members reached",
  "Profile viewers from this post",
  "Followers gained from this post",
  "Reactions",
  "Comments",
  "Reposts",
  "Saves",
  "Sends on LinkedIn",
];

export const DEMOGRAPHIC_CATEGORIES = ["Job title", "Job titles", "Location", "Locations", "Industry", "Industries", "Seniority", "Company size", "Company", "Companies"];
