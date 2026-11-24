import type { FoldSettings } from "./thresholds.js";

/** Pure text statistics for review_post. English heuristics; no dictionaries. */

/** Characters as LinkedIn counts them (code points, so an emoji counts once). */
export function charCount(text: string): number {
  return [...text].length;
}

/** Unifies line endings and curly quotes so patterns match either style. */
export function normalise(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
}

export function nonEmptyLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Blocks separated by a blank line. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n[ \t]*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function firstLine(text: string): string {
  return nonEmptyLines(text)[0] ?? "";
}

const URL_RE = /\bhttps?:\/\/\S+|\bwww\.\S+|\blnkd\.in\/\S+|\b[a-z0-9][a-z0-9-]*\.(?:com|io|ai|co|org|net|dev|app|ly|me|gg|xyz|so|to)(?:\/\S*)?(?=[\s.,;:!?)]|$)/gi;
const HASHTAG_RE = /(^|[\s(])#[\p{L}\p{N}_]+/gu;
const LIST_MARKER = /^\s*(?:\d{1,2}[.)]|[-•*–>→])\s+/;
const EMOJI_START = /^\s*\p{Extended_Pictographic}/u;

export function links(text: string): string[] {
  return text.match(URL_RE) ?? [];
}

export function hashtags(text: string): string[] {
  return (text.match(HASHTAG_RE) ?? []).map((h) => h.trim().replace(/^\(/, ""));
}

/** Text without links, hashtags and list markers: what readers actually read as prose. */
export function prose(text: string): string {
  return text
    .replace(URL_RE, " ")
    .replace(HASHTAG_RE, " ")
    .split("\n")
    .map((l) => l.replace(LIST_MARKER, "").replace(/^\s*\p{Extended_Pictographic}[️‍\p{Extended_Pictographic}]*\s*/u, ""))
    .join("\n");
}

export function words(text: string): string[] {
  return prose(text).match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu) ?? [];
}

/**
 * Sentences: split on . ! ? … followed by space, and on line breaks (feed
 * writing often drops the full stop at the end of a line).
 */
export function sentences(text: string): string[] {
  const out: string[] = [];
  for (const line of prose(text).split("\n")) {
    for (const part of line.split(/(?<=[.!?…])\s+/)) {
      if (/[\p{L}\p{N}]/u.test(part)) out.push(part.trim());
    }
  }
  return out;
}

/** Classic English syllable estimate: vowel groups, minus silent endings. */
export function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return /\d/.test(word) ? Math.max(1, Math.ceil(word.length / 2)) : 0;
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length ?? 1);
}

export interface Readability {
  flesch: number;
  words: number;
  sentences: number;
  syllables: number;
  avg_sentence_words: number;
}

export function readability(text: string): Readability {
  const ws = words(text);
  const ss = sentences(text);
  const syl = ws.reduce((n, w) => n + syllables(w), 0);
  const nW = Math.max(1, ws.length);
  const nS = Math.max(1, ss.length);
  const flesch = 206.835 - 1.015 * (nW / nS) - 84.6 * (syl / nW);
  return { flesch: Math.round(flesch * 10) / 10, words: ws.length, sentences: ss.length, syllables: syl, avg_sentence_words: Math.round((ws.length / nS) * 10) / 10 };
}

export function wordCount(sentence: string): number {
  return words(sentence).length;
}

export function emojiBulletLines(text: string): number {
  return text.split("\n").filter((l) => EMOJI_START.test(l)).length;
}

export function countMatches(text: string, re: RegExp): number {
  const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
  return (text.match(new RegExp(re.source, flags)) ?? []).length;
}

// --- The "…see more" fold -------------------------------------------------

export interface FoldView {
  /** What shows before "…see more". */
  visible: string;
  /** Whether LinkedIn would show "…see more" at all. */
  truncated: boolean;
}

/**
 * Estimates what shows above the fold: lines count as ceil(length / chars per
 * line) visual lines (a blank line is a line), and the cut comes at whichever
 * of the line or character budget runs out first, at a word boundary.
 */
export function foldView(text: string, maxChars: number, maxLines: number, charsPerLine: number): FoldView {
  const lines = text.replace(/\s+$/, "").split("\n");
  const out: string[] = [];
  let usedLines = 0;
  let usedChars = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const len = charCount(line);
    const visual = Math.max(1, Math.ceil(len / charsPerLine));
    if (usedLines + visual <= maxLines && usedChars + len <= maxChars) {
      out.push(line);
      usedLines += visual;
      usedChars += len + 1;
      continue;
    }
    const roomLines = maxLines - usedLines;
    const roomChars = Math.min(maxChars - usedChars, roomLines * charsPerLine);
    if (roomLines > 0 && roomChars > 0) {
      const chars = [...line].slice(0, roomChars).join("");
      const cut = chars.length < line.length ? chars.replace(/\s+\S*$/, "") : chars;
      if (cut.trim()) out.push(cut);
    }
    return { visible: out.join("\n").trimEnd(), truncated: true };
  }
  return { visible: out.join("\n").trimEnd(), truncated: false };
}

export interface FoldResult {
  desktop: FoldView;
  mobile: FoldView;
}

export function fold(text: string, settings: FoldSettings, hasMedia: boolean): FoldResult {
  const desktopLines = hasMedia ? settings.desktop_lines_with_media : settings.desktop_lines_text_only;
  return {
    desktop: foldView(text, settings.desktop_chars, desktopLines, settings.desktop_chars_per_line),
    mobile: foldView(text, settings.mobile_chars, settings.mobile_lines, settings.mobile_chars_per_line),
  };
}

/** Lowercase words without punctuation, for comparing openings. */
export function openingWords(line: string): string[] {
  return normalise(line)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Jaccard similarity of two word lists (as sets). */
export function similarity(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const w of sa) if (sb.has(w)) shared++;
  return shared / (sa.size + sb.size - shared);
}

export function sharedPrefix(a: string[], b: string[]): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}
