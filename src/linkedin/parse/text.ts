/** Text helpers shared by all parsers. Pure functions only. */

const NOISE_LINES = new Set([
  "…more",
  "...more",
  "… more",
  "see more",
  "see less",
  "show more",
  "show less",
  "like",
  "comment",
  "repost",
  "send",
  "reply",
  "follow",
  "following",
  "connect",
  "message",
  "more",
  "•",
  "·",
]);

/** Split innerText into trimmed, non-empty lines with consecutive duplicates removed. */
export function lines(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+/g, " ").trim();
    if (!line) continue;
    if (out.length && out[out.length - 1] === line) continue;
    out.push(line);
  }
  return out;
}

export function isNoise(line: string): boolean {
  return NOISE_LINES.has(line.toLowerCase());
}

/** Collapse whitespace, remove duplicated halves ("Jane DoeJane Doe") and "View X's profile". */
export function cleanText(text: string | null | undefined): string | null {
  if (!text) return null;
  let s = text.replace(/\s+/g, " ").trim();
  if (!s) return null;
  const half = s.length / 2;
  if (Number.isInteger(half) && s.slice(0, half) === s.slice(half)) s = s.slice(0, half);
  s = s.replace(/\s*View .{1,80}?['’]s\s+(full\s+)?profile\s*/gi, " ").trim();
  return s || null;
}

/** Multi-line text with duplicate-line collapse and "…more" stripped. */
export function cleanBody(text: string | null | undefined): string | null {
  const ls = lines(text).filter((l) => !/^(…|\.\.\.)\s?(more|see more)$/i.test(l) && l.toLowerCase() !== "see translation");
  return ls.length ? ls.join("\n") : null;
}

/**
 * "1,234" → 1234, "12K" → 12000, "2.3M" → 2300000, "1.234" (European) → 1234.
 * Returns null when no number is present.
 */
export function parseCount(input: string | null | undefined): number | null {
  if (!input) return null;
  const m = /(\d[\d,.\s]*)\s*([kKmM])?(?![a-zA-Z])/.exec(input);
  if (!m) return null;
  let digits = m[1]!.replace(/\s/g, "");
  const suffix = m[2]?.toLowerCase();
  if (suffix) {
    const n = Number(digits.replace(",", "."));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (suffix === "k" ? 1_000 : 1_000_000));
  }
  // thousands separators: "1,234", "1.234", "12,345,678"
  if (/^\d{1,3}([,.]\d{3})+$/.test(digits)) digits = digits.replace(/[,.]/g, "");
  else digits = digits.replace(/,/g, "");
  const n = Number(digits);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Finds e.g. "123 reactions" in a list of labels or lines and returns 123. */
export function countByKeyword(sources: (string | null | undefined)[], keyword: RegExp): number | null {
  for (const s of sources) {
    if (!s) continue;
    const re = new RegExp(`(\\d[\\d,.]*\\s*[kKmM]?)\\s+(?:other\\s+)?${keyword.source}`, "i");
    const m = re.exec(s);
    if (m) return parseCount(m[1]);
  }
  return null;
}

/** A relative timestamp like "3d", "1w", "2mo", "5h", "now", "Edited". */
export function relativeTime(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = /\b(now|just now|\d+\s?(?:s|m|h|d|w|mo|yr|y)\b|\d+\s(?:second|minute|hour|day|week|month|year)s?\s(?:ago)?)/i.exec(text);
  return m ? m[1]!.trim() : null;
}

/** Connection degree from "• 2nd", "2nd degree connection", "1st". */
export function degree(text: string | null | undefined): "1st" | "2nd" | "3rd+" | null {
  if (!text) return null;
  const m = /\b(1st|2nd|3rd\+?)\b/i.exec(text);
  if (!m) return null;
  const v = m[1]!.toLowerCase();
  return v === "1st" ? "1st" : v === "2nd" ? "2nd" : "3rd+";
}

export function truncate(text: string | null, max: number): string | null {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
