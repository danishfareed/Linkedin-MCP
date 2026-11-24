import type { FunnelStage } from "../workspace/schemas.js";
import {
  AI_PHRASES,
  BAIT_SOFT,
  BAIT_STRONG,
  CTA_FIT,
  CTA_PATTERNS,
  type CtaType,
  I_WORDS,
  type PhrasePattern,
  REVERSALS,
  RHETORICAL_OPENERS,
  TENSION_WORDS,
  THROAT_CLEARING,
  VAGUE_WORDS,
  YOU_WORDS,
} from "./phrases.js";
import {
  charCount,
  countMatches,
  emojiBulletLines,
  firstLine,
  fold,
  hashtags,
  links,
  nonEmptyLines,
  normalise,
  openingWords,
  readability,
  sentences,
  sharedPrefix,
  similarity,
  wordCount,
  words,
} from "./text.js";
import { type BasisConfidence, type CheckId, DEFAULT_FOLD, FOLD_BASIS, type FoldSettings, SCORE_CAPS, REVIEW_THRESHOLDS as T, STATUS_CREDIT, VERDICTS } from "./thresholds.js";

/**
 * review_post: a deterministic, explainable draft checker. No AI call: every
 * result comes from the rules and thresholds in thresholds.ts and phrases.ts.
 */

export type CheckStatus = "pass" | "warn" | "fail";

export interface CheckResult {
  id: CheckId;
  label: string;
  status: CheckStatus;
  reason: string;
  fix?: string;
  basis: BasisConfidence;
  details?: Record<string, unknown>;
}

export interface ReviewContext {
  funnel_stage?: FunnelStage;
  method?: string;
  has_media?: boolean;
  banned_words?: string[];
  banned_phrases?: string[];
  topics_to_avoid?: string[];
  /** First lines of recent posts and other drafts, to catch repeated openings. */
  recent_openings?: { text: string; source: string }[];
  /** The user's own writing; em dashes there aren't counted as a machine tell. */
  voice_samples?: string[];
  fold?: Partial<FoldSettings>;
}

export interface ReviewResult {
  score: number;
  verdict: string;
  /** True when no check failed. Warnings are judgement calls for the user. */
  ready_to_post: boolean;
  /** Failed checks that make posting a bad idea whatever the score: over the limit, a banned phrase, engagement bait. */
  blockers: CheckId[];
  /** Set when a failing check capped the score. */
  score_capped_at?: number;
  characters: number;
  words: number;
  hook: {
    first_line: string;
    above_fold_desktop: string;
    above_fold_mobile: string;
    see_more_desktop: boolean;
    see_more_mobile: boolean;
    fold_settings: FoldSettings;
    fold_note: string;
  };
  checks: CheckResult[];
  skipped: { id: CheckId; reason: string }[];
  summary: Record<CheckStatus, number>;
  top_fixes: string[];
  stats: Record<string, number>;
}

const BLOCKING: CheckId[] = ["length_limit", "banned_phrases", "engagement_bait"];

type Outcome = Omit<CheckResult, "id" | "label" | "basis"> | { skip: string };

function quote(s: string, max = 80): string {
  const t = s.replace(/\s+/g, " ").trim();
  return `"${t.length > max ? `${t.slice(0, max - 1)}…` : t}"`;
}

function worst(...xs: CheckStatus[]): CheckStatus {
  return xs.includes("fail") ? "fail" : xs.includes("warn") ? "warn" : "pass";
}

function matchAll(text: string, patterns: PhrasePattern[]): PhrasePattern[] {
  return patterns.filter((p) => p.re.test(text));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  const start = /^[\p{L}\p{N}]/u.test(t) ? "(?<![\\p{L}\\p{N}])" : "";
  const end = /[\p{L}\p{N}]$/u.test(t) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${start}${escapeRe(normalise(t))}${end}`, "iu").test(text);
}

/** The opening the reader judges: the first line, or its first sentence when the line is long. */
function hookOf(text: string): string {
  const line = firstLine(text);
  if (charCount(line) <= T.hook_length.warn_max) return line;
  return sentences(line)[0] ?? line;
}

/** A natural place to end a long first line: the last clause break before the limit. */
function cutSuggestion(line: string, max: number): string | null {
  const head = [...line].slice(0, max).join("");
  const m = /^(.*[,:;—–?!.-])\s/.exec(head);
  return m && m[1]!.length >= 20 ? m[1]! : null;
}

// --- Checks -----------------------------------------------------------------

function checkLengthLimit(chars: number): Outcome {
  const r = T.length_limit;
  if (chars > r.max) return { status: "fail", reason: `${chars} characters; LinkedIn allows ${r.max}.`, fix: `Cut ${chars - r.max} characters. Remove a paragraph rather than squeezing words.`, details: { characters: chars } };
  if (chars > r.warn_above) return { status: "warn", reason: `${chars} characters, close to the ${r.max} limit.`, fix: "Leave some room: edits before posting often add a few words." };
  return { status: "pass", reason: `${chars} of ${r.max} characters.` };
}

function checkHookLength(line: string): Outcome {
  const r = T.hook_length;
  const n = charCount(line);
  if (!n) return { status: "fail", reason: "The post has no first line.", fix: "Start with one short line that makes the point or the promise." };
  if (n <= r.pass_max) return { status: "pass", reason: `First line is ${n} characters.` };
  const cut = cutSuggestion(line, r.pass_max);
  const fix = cut ? `End the first line after ${quote(cut)} and move the rest to the next line.` : `Cut the first line to under ${r.pass_max} characters and move the detail to line two.`;
  return { status: n <= r.warn_max ? "warn" : "fail", reason: `First line is ${n} characters; it crowds the fold on a phone.`, fix, details: { characters: n } };
}

function checkFold(hook: string, f: ReturnType<typeof fold>): Outcome {
  const has = (visible: string) => visible.replace(/\s+/g, " ").startsWith(hook.replace(/\s+/g, " "));
  if (!f.mobile.truncated) return { status: "pass", reason: "The whole post shows without '…see more'." };
  if (has(f.mobile.visible)) return { status: "pass", reason: "The full hook shows above '…see more' on mobile and desktop." };
  if (has(f.desktop.visible)) {
    return {
      status: "warn",
      reason: `On mobile the hook is cut at ${quote(f.mobile.visible.split("\n").pop() ?? "")}.`,
      fix: "Put the core promise in the first ~140 characters, or break the line earlier, so phone readers see the whole hook.",
    };
  }
  return { status: "fail", reason: "The hook is cut off before '…see more' even on desktop.", fix: "Shorten the opening so the first idea finishes within about two lines." };
}

function checkFirstLine(line: string): Outcome {
  const clearing = THROAT_CLEARING.find((p) => p.re.test(line));
  if (clearing) {
    return {
      status: "fail",
      reason: `Opens with a warm-up (${clearing.label}) instead of the point.`,
      fix: "Delete the opener and start with the most surprising fact, the result, or the problem.",
      details: { opener: clearing.label },
    };
  }
  const tokens = words(line);
  const signals: string[] = [];
  if (/\d/.test(line)) signals.push("a number");
  if (TENSION_WORDS.test(line)) signals.push("tension or contrast");
  if (countMatches(line, YOU_WORDS) > 0) signals.push("speaks to the reader");
  if (properNouns(line).length) signals.push("a specific name");
  const short = tokens.length <= T.first_line.max_words_for_short_signal;
  if (signals.length >= T.first_line.min_signals) {
    return { status: "pass", reason: `First line has ${signals.join(", ")}${short ? " and is short" : ""}.`, details: { signals } };
  }
  return {
    status: "warn",
    reason: "First line has no number, tension, name or direct 'you'; it may not stop the scroll.",
    fix: "Add the specific result, a number, or the mistake/tension the post resolves.",
  };
}

function checkReadability(r: ReturnType<typeof readability>, longest: string | null): Outcome {
  const t = T.readability;
  if (r.words < t.min_words) return { skip: `fewer than ${t.min_words} words` };
  const status: CheckStatus = r.flesch >= t.pass_min ? "pass" : r.flesch >= t.warn_min ? "warn" : "fail";
  const reason = `Flesch reading ease ${r.flesch} (${r.flesch >= 70 ? "easy" : r.flesch >= 60 ? "plain English" : r.flesch >= 50 ? "fairly hard" : "hard"}).`;
  if (status === "pass") return { status, reason, details: { flesch: r.flesch } };
  return { status, reason, fix: `Use shorter words and split long sentences${longest ? `, starting with ${quote(longest, 60)}` : ""}. Aim for ${t.pass_min}+.`, details: { flesch: r.flesch } };
}

function checkSentenceLength(text: string): Outcome {
  const t = T.sentence_length;
  const ss = sentences(text);
  if (!ss.length) return { skip: "no sentences" };
  const counts = ss.map((s) => ({ s, n: wordCount(s) }));
  const avg = counts.reduce((a, c) => a + c.n, 0) / counts.length;
  const long = counts.filter((c) => c.n > t.long_sentence_words).sort((a, b) => b.n - a.n);
  let status: CheckStatus = avg <= t.pass_avg_max ? "pass" : avg <= t.warn_avg_max ? "warn" : "fail";
  if (status === "pass" && long.length) status = "warn";
  const reason = `Average ${avg.toFixed(1)} words per sentence${long.length ? `; ${long.length} sentence(s) over ${t.long_sentence_words} words` : ""}.`;
  if (status === "pass") return { status, reason };
  return { status, reason, fix: long.length ? `Split ${quote(long[0]!.s, 70)} (${long[0]!.n} words) into two or three sentences.` : `Bring the average under ${t.pass_avg_max} words: split sentences joined with 'and', 'but' or 'which'.`, details: { average: Math.round(avg * 10) / 10 } };
}

function checkParagraphs(text: string): Outcome {
  const t = T.paragraphs;
  const lines = nonEmptyLines(text);
  let worstLine: { line: string; sentences: number; chars: number; status: CheckStatus } | null = null;
  for (const line of lines) {
    const n = sentences(line).length;
    const chars = charCount(line);
    const bySentences: CheckStatus = n <= t.pass_max_sentences ? "pass" : n <= t.warn_max_sentences ? "warn" : "fail";
    const byChars: CheckStatus = chars <= t.pass_max_chars ? "pass" : chars <= t.warn_max_chars ? "warn" : "fail";
    const status = worst(bySentences, byChars);
    const rank = { pass: 0, warn: 1, fail: 2 };
    if (!worstLine || rank[status] > rank[worstLine.status] || (rank[status] === rank[worstLine.status] && chars > worstLine.chars)) worstLine = { line, sentences: n, chars, status };
  }
  if (!worstLine) return { skip: "empty" };
  if (worstLine.status === "pass") return { status: "pass", reason: `Paragraphs are short (longest ${worstLine.chars} characters).` };
  return {
    status: worstLine.status,
    reason: `Paragraph ${quote(worstLine.line, 50)} has ${worstLine.sentences} sentences and ${worstLine.chars} characters.`,
    fix: `Break it into paragraphs of 1-${t.pass_max_sentences} sentences (under ${t.pass_max_chars} characters).`,
  };
}

function checkWhitespace(text: string, chars: number): Outcome {
  const t = T.whitespace;
  const lines = nonEmptyLines(text);
  const blankLines = /\n[ \t]*\n/.test(text);
  if (chars > t.wall_of_text_chars && lines.length === 1) {
    return { status: "fail", reason: "The post is one block of text with no line breaks.", fix: "Put the hook on its own line, then one idea per short paragraph with a blank line between." };
  }
  if (chars > t.blank_line_needed_chars && lines.length > t.blank_line_needed_lines && !blankLines) {
    return { status: "warn", reason: `${lines.length} lines with no blank lines between them.`, fix: "Add blank lines between ideas so the post scans on a phone." };
  }
  return { status: "pass", reason: `${lines.length} line(s)${blankLines ? " with blank lines between ideas" : ""}.` };
}

function checkLengthBand(text: string, chars: number, hasMedia: boolean): Outcome {
  const t = T.length_band;
  if (chars < t.short_below) {
    if (hasMedia) return { status: "pass", reason: `Short (${chars} characters), which suits a post carried by its media.` };
    if (/\?\s*$/.test(text.trim())) return { status: "pass", reason: `Short (${chars} characters) and ends with a question.` };
    return { status: "warn", reason: `Short for a text-only post (${chars} characters).`, fix: "Add the story, example or numbers behind the point, or attach an image." };
  }
  if (chars > t.very_long_above) return { status: "warn", reason: `Very long (${chars} characters).`, fix: "Cut anything that doesn't serve the one point; consider a carousel for the detail." };
  if (chars > t.long_above) return { status: "warn", reason: `Long (${chars} characters).`, fix: "Check every paragraph earns its place; long posts need a strong reason to keep reading." };
  return { status: "pass", reason: `${chars} characters, within the usual range for text posts.` };
}

const TIME_MARKER = /\b(yesterday|today|tonight|last\s+(week|month|year|quarter)|(19|20)\d{2}|(january|february|march|april|june|july|august|september|october|november|december|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi;

function specifics(text: string): { numbers: string[]; names: string[]; times: string[] } {
  const numbers: string[] = [];
  for (const line of nonEmptyLines(text)) {
    const stripped = line.replace(/^\s*\d{1,2}[.)]\s+/, "");
    numbers.push(...(stripped.match(/[$€£]?\d+(?:[.,]\d+)*(?:\s?(?:%|k\b|m\b|x\b))?/gi) ?? []));
  }
  return { numbers, names: properNouns(text), times: text.match(TIME_MARKER) ?? [] };
}

/** Capitalised words that don't start a sentence or line, and acronyms: a rough proper-noun count. */
function properNouns(text: string): string[] {
  const names: string[] = [];
  for (const s of sentences(text)) {
    for (const w of words(s).slice(1)) if (w !== "I" && !/^I'/.test(w) && (/^[A-Z][\p{Ll}]+/u.test(w) || /^[A-Z]{2,}s?$/.test(w))) names.push(w);
  }
  return names;
}

function checkSpecificity(text: string, nWords: number): Outcome {
  const t = T.specificity;
  if (nWords < t.min_words) return { skip: `fewer than ${t.min_words} words` };
  const s = specifics(text);
  const total = new Set([...s.numbers, ...s.names, ...s.times].map((x) => x.toLowerCase())).size;
  const per100 = (total / nWords) * 100;
  const vague = countMatches(text, VAGUE_WORDS);
  const vaguePer100 = (vague / nWords) * 100;
  let status: CheckStatus = per100 >= t.pass_per_100_words ? "pass" : per100 >= t.warn_per_100_words ? "warn" : "fail";
  if (status === "pass" && vaguePer100 > t.vague_per_100_words) status = "warn";
  const reason = `${total} specific detail(s) (${per100.toFixed(1)} per 100 words): ${s.numbers.length} number(s), ${s.names.length} name(s), ${s.times.length} time reference(s)${vague ? `; ${vague} vague word(s)` : ""}.`;
  const details = { per_100_words: Math.round(per100 * 10) / 10, examples: [...new Set([...s.numbers.slice(0, 3), ...s.names.slice(0, 3), ...s.times.slice(0, 2)])] };
  if (status === "pass") return { status, reason, details };
  return { status, reason, fix: "Swap a general claim for the real number, name, date or example from your proof bank. Replace 'things', 'a lot', 'very' with the specific.", details };
}

function checkReaderFocus(text: string, method?: string): Outcome {
  const t = T.reader_focus;
  const you = countMatches(text, YOU_WORDS);
  const i = countMatches(text, I_WORDS);
  const story = /story|personal|journey|lesson/i.test(method ?? "");
  const max = story ? t.max_i_to_you_ratio_story : t.max_i_to_you_ratio;
  const details = { you_words: you, i_words: i };
  if (i < t.min_i_words) return { status: "pass", reason: `'You' ${you}×, 'I/me/my' ${i}×.`, details };
  if (you === 0) return { status: "warn", reason: `'I/me/my' ${i}× and no 'you'.`, fix: "Turn the lesson outward: add a line on what the reader should do or take from it.", details };
  if (i / you > max) return { status: "warn", reason: `'I/me/my' ${i}× vs 'you' ${you}×.`, fix: "Keep the story, but end each beat with what it means for the reader.", details };
  return { status: "pass", reason: `'You' ${you}×, 'I/me/my' ${i}×.`, details };
}

function triads(text: string): string[] {
  const found: string[] = [];
  if (/(^|[.!?\n]\s*)(no|not|zero|never)\s+[^.!?\n]{1,30}[.!]\s*(no|not|zero|never)\s+[^.!?\n]{1,30}[.!]\s*(no|not|zero|never|just|only)\s+/i.test(text)) found.push("'No X. No Y. No Z.' pattern");
  const firstWords = nonEmptyLines(text).map((l) => openingWords(l.replace(/^\s*(?:\d{1,2}[.)]|[-•*–>→])\s+/, ""))[0] ?? "");
  const skip = new Set(["i", "the", "a", "an", "and", "you", "we", "it", "my"]);
  for (let k = 0; k + 2 < firstWords.length; k++) {
    const w = firstWords[k]!;
    if (w && !skip.has(w) && firstWords[k + 1] === w && firstWords[k + 2] === w) {
      found.push(`three lines in a row starting with "${w}"`);
      break;
    }
  }
  const lists = countMatches(text, /\b[\p{L}]+(?:\s[\p{L}]+)?,\s+[\p{L}]+(?:\s[\p{L}]+)?,?\s+and\s+[\p{L}]+\b/u);
  if (lists >= T.ai_tells.triad_lists_tell_at) found.push(`${lists} "A, B and C" lists of three`);
  return found;
}

function checkAiTells(text: string, line: string, voiceSamples: string[]): Outcome {
  const t = T.ai_tells;
  const tells: { tell: string; fix: string; weight: number }[] = [];
  const dashes = countMatches(text, /—|\s–\s|\s--\s/);
  const voiceDashes = voiceSamples.reduce((n, s) => n + countMatches(s, /—|\s–\s/), 0);
  let dashNote: string | null = null;
  if (dashes && voiceDashes >= 2) dashNote = `${dashes} em dash(es), not counted: your own samples use them too.`;
  else if (dashes) tells.push({ tell: `${dashes} em dash(es)`, fix: "Use a full stop, comma or colon instead of em dashes.", weight: dashes >= t.em_dash_double_count_at ? 2 : 1 });
  for (const p of matchAll(text, AI_PHRASES)) tells.push({ tell: `"${p.label}"`, fix: p.fix ?? "Say it plainly in your own words.", weight: 1 });
  const reversals = matchAll(text, REVERSALS).slice(0, 2);
  for (const p of reversals) tells.push({ tell: p.label, fix: "State Y directly; the 'not X' set-up is a common machine pattern.", weight: 1 });
  const opener = RHETORICAL_OPENERS.find((p) => p.re.test(line));
  if (opener) tells.push({ tell: `rhetorical opener "${opener.label}"`, fix: "Open with the answer or the result instead of a question.", weight: 1 });
  const bullets = emojiBulletLines(text);
  if (bullets >= t.emoji_bullets_tell_at) tells.push({ tell: `${bullets} emoji bullet lines`, fix: "Use plain dashes or numbers, or at most one or two emoji.", weight: bullets >= t.emoji_bullets_double_at ? 2 : 1 });
  for (const tr of triads(text)) tells.push({ tell: tr, fix: "Break the symmetry: use two items, or four, or one strong example.", weight: 1 });

  const score = tells.reduce((n, x) => n + x.weight, 0);
  const details = { tells: tells.map((x) => x.tell), ...(dashNote ? { note: dashNote } : {}) };
  if (score < t.warn_at) return { status: "pass", reason: dashNote ?? "No common machine-writing patterns found.", details };
  return {
    status: score >= t.fail_at ? "fail" : "warn",
    reason: `Reads as machine-written in places: ${tells.map((x) => x.tell).join("; ")}.`,
    fix: [...new Set(tells.map((x) => x.fix))].join(" "),
    details,
  };
}

function checkHashtags(text: string): Outcome {
  const t = T.hashtags;
  const tags = hashtags(text);
  if (tags.length <= t.pass_max) return { status: "pass", reason: `${tags.length} hashtag(s).` };
  return {
    status: tags.length <= t.warn_max ? "warn" : "fail",
    reason: `${tags.length} hashtags: ${tags.join(" ")}.`,
    fix: `Keep at most ${t.pass_max}, the most specific to the topic.`,
    details: { hashtags: tags },
  };
}

function checkLinks(text: string): Outcome {
  const found = links(text);
  if (!found.length) return { status: "pass", reason: "No external links in the post body." };
  return {
    status: "warn",
    reason: `${found.length} link(s) in the body (${found.slice(0, 2).join(", ")}). Evidence is mixed: many creators report less reach for in-body links, but LinkedIn hasn't confirmed a penalty.`,
    fix: "Make sure the post is valuable without the click. Consider testing link-in-body against link-in-first-comment and compare with growth_report.",
    details: { links: found },
  };
}

function checkBait(text: string): Outcome {
  const strong = matchAll(text, BAIT_STRONG);
  if (strong.length) {
    return {
      status: "fail",
      reason: `Asks for engagement in a way LinkedIn says it demotes: ${strong.map((p) => `"${p.label}"`).join(", ")}.`,
      fix: "Ask a real question about the topic instead (e.g. 'What would you add?'), and never ask for likes, 'comment YES' or tags.",
      details: { phrases: strong.map((p) => p.label) },
    };
  }
  const soft = matchAll(text, BAIT_SOFT);
  if (soft.length) {
    return {
      status: "warn",
      reason: `Close to engagement bait: ${soft.map((p) => `"${p.label}"`).join(", ")}.`,
      fix: "Keep one honest CTA. If you offer a resource, say what it is and why it helps, not only 'comment X'.",
      details: { phrases: soft.map((p) => p.label) },
    };
  }
  return { status: "pass", reason: "No engagement-bait phrases." };
}

/** CTA types in the last two lines, ignoring trailing hashtag-only or link-only lines. */
export function detectCtas(text: string): CtaType[] {
  const lines = nonEmptyLines(text);
  while (lines.length && /^((#[\p{L}\p{N}_]+|https?:\/\/\S+|www\.\S+)\s*)+$/u.test(lines[lines.length - 1]!)) lines.pop();
  const tail = lines.slice(-2);
  const found = new Set(CTA_PATTERNS.filter((p) => p.re.test(tail.join("\n"))).map((p) => p.type));
  if (tail.some((l) => /\?\s*\S{0,3}$/u.test(l))) found.add("conversation");
  return [...found];
}

function checkCta(text: string, stage?: FunnelStage): Outcome {
  const found = detectCtas(text);
  if (!found.length) {
    return { status: "warn", reason: "No clear call to action at the end.", fix: stage === "BOF" ? "End with the offer's next step (e.g. 'DM me \"audit\" for a 20-minute review')." : "End with a specific question or a next step that fits the post." };
  }
  if (stage) {
    const fits = found.filter((c) => CTA_FIT[stage].includes(c));
    if (!fits.length) {
      return {
        status: "warn",
        reason: `CTA type ${found.join("/")} doesn't fit a ${stage} post.`,
        fix: `For ${stage}, use ${CTA_FIT[stage].join(", ").replace("save_share", "save/share")}.`,
        details: { cta_types: found },
      };
    }
  }
  return { status: "pass", reason: `Ends with a ${found.join("/").replace("save_share", "save/share")} CTA.`, details: { cta_types: found } };
}

function checkBanned(text: string, ctx: ReviewContext): Outcome {
  const banned = [...(ctx.banned_words ?? []), ...(ctx.banned_phrases ?? [])];
  const topics = ctx.topics_to_avoid ?? [];
  if (!banned.length && !topics.length) return { skip: "no banned words, phrases or topics in the growth profile" };
  const hits = banned.filter((b) => containsTerm(text, b));
  const topicHits = topics.filter((b) => containsTerm(text, b));
  if (hits.length) return { status: "fail", reason: `Uses banned word(s)/phrase(s): ${hits.map((h) => `"${h}"`).join(", ")}.`, fix: "Rewrite those lines without them.", details: { banned: hits } };
  if (topicHits.length) return { status: "warn", reason: `Touches topic(s) the user avoids: ${topicHits.join(", ")}.`, fix: "Check with the user, or remove the reference.", details: { topics: topicHits } };
  return { status: "pass", reason: "No banned words, phrases or avoided topics." };
}

function checkRepeatedOpening(line: string, recent: { text: string; source: string }[]): Outcome {
  const t = T.repeated_opening;
  if (!recent.length) return { skip: "no recent posts or drafts to compare with" };
  const mine = openingWords(line);
  if (mine.length < 2) return { skip: "first line too short to compare" };
  let worstHit: { status: CheckStatus; source: string; text: string; prefix: number; sim: number } | null = null;
  for (const r of recent.slice(0, t.recent_posts)) {
    const theirs = openingWords(r.text);
    const prefix = sharedPrefix(mine, theirs);
    const sim = similarity(mine, theirs);
    let status: CheckStatus = "pass";
    if (prefix >= t.same_first_words_fail || (sim >= t.similarity_fail && Math.min(mine.length, theirs.length) >= 4)) status = "fail";
    else if (prefix >= t.same_first_words_warn) status = "warn";
    if (status !== "pass" && (!worstHit || (status === "fail" && worstHit.status !== "fail"))) worstHit = { status, source: r.source, text: r.text, prefix, sim };
  }
  if (!worstHit) return { status: "pass", reason: `Opening differs from the last ${Math.min(recent.length, t.recent_posts)} post(s) and drafts.` };
  return {
    status: worstHit.status,
    reason: `Opening is close to ${worstHit.source}: ${quote(worstHit.text, 70)} (${worstHit.prefix} shared opening word(s)).`,
    fix: "Open differently from recent posts: lead with the result, a number, or a line of dialogue.",
    details: { similar_to: worstHit.source },
  };
}

// --- Runner -----------------------------------------------------------------

const LABELS: Record<CheckId, string> = {
  length_limit: "Character limit",
  hook_length: "Hook length",
  fold: "Hook above the fold",
  first_line: "First-line strength",
  readability: "Readability",
  sentence_length: "Sentence length",
  paragraphs: "Paragraph length",
  whitespace: "Whitespace and line breaks",
  length_band: "Total length",
  specificity: "Specificity",
  reader_focus: "Reader focus (you vs I)",
  ai_tells: "Machine-writing tells",
  hashtags: "Hashtags",
  external_links: "External links",
  engagement_bait: "Engagement bait",
  cta: "Call to action",
  banned_phrases: "Banned words and topics",
  repeated_opening: "Repeated opening",
};

export function reviewPost(raw: string, ctx: ReviewContext = {}): ReviewResult {
  const text = normalise(raw).trim();
  const chars = charCount(raw.trim());
  const foldSettings: FoldSettings = { ...DEFAULT_FOLD, ...Object.fromEntries(Object.entries(ctx.fold ?? {}).filter(([, v]) => v !== undefined)) };
  const hasMedia = Boolean(ctx.has_media);
  const line = firstLine(text);
  const hook = hookOf(text);
  const f = fold(text, foldSettings, hasMedia);
  const read = readability(text);
  const longest = sentences(text).sort((a, b) => wordCount(b) - wordCount(a))[0] ?? null;

  const outcomes: [CheckId, Outcome][] = [
    ["length_limit", checkLengthLimit(chars)],
    ["hook_length", checkHookLength(line)],
    ["fold", checkFold(hook, f)],
    ["first_line", checkFirstLine(line)],
    ["readability", checkReadability(read, longest)],
    ["sentence_length", checkSentenceLength(text)],
    ["paragraphs", checkParagraphs(text)],
    ["whitespace", checkWhitespace(text, chars)],
    ["length_band", checkLengthBand(text, chars, hasMedia)],
    ["specificity", checkSpecificity(text, read.words)],
    ["reader_focus", checkReaderFocus(text, ctx.method)],
    ["ai_tells", checkAiTells(text, line, ctx.voice_samples ?? [])],
    ["hashtags", checkHashtags(text)],
    ["external_links", checkLinks(text)],
    ["engagement_bait", checkBait(text)],
    ["cta", checkCta(text, ctx.funnel_stage)],
    ["banned_phrases", checkBanned(text, ctx)],
    ["repeated_opening", checkRepeatedOpening(line, ctx.recent_openings ?? [])],
  ];

  const checks: CheckResult[] = [];
  const skipped: ReviewResult["skipped"] = [];
  for (const [id, o] of outcomes) {
    if ("skip" in o) skipped.push({ id, reason: o.skip });
    else checks.push({ id, label: LABELS[id], basis: T[id].basis.confidence, ...o });
  }

  let earned = 0;
  let total = 0;
  for (const c of checks) {
    total += T[c.id].weight;
    earned += T[c.id].weight * STATUS_CREDIT[c.status];
  }
  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const c of checks) summary[c.status]++;
  const weighted = total ? Math.round((earned / total) * 100) : 0;
  const cap = SCORE_CAPS.find((c) => summary.fail >= c.fails);
  const score = cap ? Math.min(weighted, cap.max) : weighted;
  const blockers = checks.filter((c) => c.status === "fail" && BLOCKING.includes(c.id)).map((c) => c.id);
  const byPriority = [...checks].filter((c) => c.status !== "pass" && c.fix).sort((a, b) => (a.status === b.status ? T[b.id].weight - T[a.id].weight : a.status === "fail" ? -1 : 1));

  return {
    score,
    verdict: VERDICTS.find((v) => score >= v.min)!.label,
    ready_to_post: summary.fail === 0,
    blockers,
    ...(cap && weighted > cap.max ? { score_capped_at: cap.max } : {}),
    characters: chars,
    words: read.words,
    hook: {
      first_line: line,
      above_fold_desktop: f.desktop.visible,
      above_fold_mobile: f.mobile.visible,
      see_more_desktop: f.desktop.truncated,
      see_more_mobile: f.mobile.truncated,
      fold_settings: foldSettings,
      fold_note: FOLD_BASIS.source,
    },
    checks,
    skipped,
    summary,
    top_fixes: byPriority.slice(0, 5).map((c) => `${c.label}: ${c.fix}`),
    stats: {
      flesch: read.flesch,
      avg_sentence_words: read.avg_sentence_words,
      sentences: read.sentences,
      lines: nonEmptyLines(text).length,
      hashtags: hashtags(text).length,
      links: links(text).length,
    },
  };
}

/** The basis for every check, for tools that explain themselves. */
export function reviewBases(): Record<CheckId, { label: string; confidence: BasisConfidence; source: string }> {
  return Object.fromEntries((Object.keys(T) as CheckId[]).map((id) => [id, { label: LABELS[id], confidence: T[id].basis.confidence, source: T[id].basis.source }])) as Record<CheckId, { label: string; confidence: BasisConfidence; source: string }>;
}
