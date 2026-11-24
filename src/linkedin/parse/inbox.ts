import type { Snapshot } from "../snapshot.js";
import { cleanLink } from "../urls.js";
import { cleanBody, cleanText, lines, relativeTime } from "./text.js";
import { containsText } from "./verify.js";

export interface Notification {
  text: string | null;
  time: string | null;
  url: string | null;
  unread: boolean;
}

export function parseNotification(s: Snapshot): Notification | null {
  const ls = lines(s.text).filter((l) => !/^(options|show options|more options for this notification)$/i.test(l));
  const time = cleanText(s.fields.time) ?? ls.map((l) => (l.length < 12 ? relativeTime(l) : null)).find(Boolean) ?? null;
  const text = cleanText(s.fields.text) ?? ls.filter((l) => l !== time && !/^(view|reply|like|unread notification\.?)$/i.test(l)).join(" ") ?? null;
  if (!text) return null;
  return {
    text: text.replace(/^unread notification\.?\s*/i, ""),
    time,
    url: cleanLink(s.attrs.link),
    unread: /unread/i.test(s.attrs.cls ?? "") || /^unread notification/i.test(s.text),
  };
}

export interface ConversationSummary {
  name: string | null;
  snippet: string | null;
  time: string | null;
  unread: boolean;
  thread_url: string | null;
}

export function parseConversation(s: Snapshot): ConversationSummary | null {
  const ls = lines(s.text).filter((l) => !/^(active now|status is (online|offline|reachable)|sponsored|inmail|open the options list.*)$/i.test(l));
  const name = cleanText(s.fields.name) ?? ls[0] ?? null;
  if (!name) return null;
  const time = cleanText(s.fields.time) ?? ls.find((l) => /^(\d{1,2}:\d{2}\s?(am|pm)?|mon|tue|wed|thu|fri|sat|sun|[a-z]{3} \d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})$/i.test(l)) ?? null;
  const snippet = cleanText(s.fields.snippet) ?? ls.find((l) => l !== name && l !== time) ?? null;
  return {
    name,
    snippet,
    time,
    unread: /unread/i.test(s.attrs.cls ?? "") || /\bunread\b/i.test(s.text.slice(0, 100)),
    thread_url: cleanLink(s.attrs.link ?? s.links.find((l) => /\/messaging\/thread\//.test(l.href))?.href),
  };
}

export interface Message {
  sender: string | null;
  time: string | null;
  text: string | null;
}

/** Sender and time appear only on the first message of a group; carry them forward. */
export function parseMessages(snapshots: Snapshot[], limit: number): Message[] {
  const out: Message[] = [];
  let sender: string | null = null;
  let time: string | null = null;
  for (const s of snapshots) {
    sender = cleanText(s.fields.sender) ?? sender;
    time = cleanText(s.fields.time) ?? time;
    const text = cleanBody(s.fields.text);
    if (!text) continue;
    out.push({ sender, time, text });
  }
  return out.slice(-limit);
}

export interface Invitation {
  /** Inviter's public identifier; pass to respond_to_invitation. */
  id: string | null;
  name: string | null;
  headline: string | null;
  profile_url: string | null;
  time: string | null;
  note: string | null;
}

export function parseInvitation(s: Snapshot): Invitation | null {
  const url = cleanLink(s.attrs.link ?? s.links.find((l) => /\/in\//.test(l.href))?.href);
  const ls = lines(s.text).filter((l) => !/^(accept|ignore|withdraw|message|see all|reply to .+)$/i.test(l));
  const name = cleanText(s.fields.name) ?? ls[0] ?? null;
  if (!name && !url) return null;
  const id = url ? /\/in\/([^/]+)/.exec(url)?.[1] ?? null : null;
  return {
    id: id ? decodeURIComponent(id) : null,
    name,
    headline: cleanText(s.fields.headline) ?? ls.find((l) => l !== name && !/mutual|ago|^sent/i.test(l)) ?? null,
    profile_url: url,
    time: cleanText(s.fields.time) ?? ls.find((l) => /\b(ago|today|yesterday|sent)\b/i.test(l)) ?? null,
    note: cleanBody(s.fields.note),
  };
}

/**
 * Whether a link points at exactly this public id (not a longer id that
 * starts with it, as `/in/jane` vs `/in/jane-doe`).
 */
export function linksToProfile(href: string | null | undefined, publicId: string): boolean {
  const id = href ? /\/in\/([^/?#]+)/i.exec(href)?.[1] : undefined;
  return Boolean(id) && safeDecode(id!).toLowerCase() === publicId.toLowerCase();
}

// --- Recipient checks -------------------------------------------------------

/** Titles and credentials that don't identify a person. */
const NAME_NOISE = new Set(["dr", "mr", "mrs", "ms", "mx", "prof", "sir", "phd", "mba", "md", "jr", "sr", "ii", "iii", "iv", "cpa", "cfa", "pmp", "esq"]);

/**
 * A display name as comparable tokens: accents and case removed, pronouns and
 * other parentheticals dropped, cut at separators ("Jane Doe, MBA",
 * "Jane Doe • 1st"), emoji and punctuation removed.
 */
export function nameTokens(name: string | null | undefined): string[] {
  if (!name) return [];
  let s = name.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, " ");
  s = s.split(/[•|·,]|\s[-–—]\s/)[0] ?? "";
  s = s.replace(/[^\p{L}\p{N}\s'’-]/gu, " ");
  return s
    .split(/\s+/)
    .map((t) => t.replace(/^['’-]+|['’-]+$/g, ""))
    .filter((t) => t && !NAME_NOISE.has(t));
}

/**
 * Whether two display names are the same person's: first and last names
 * must match after normalising. Middle names may differ. A single-word name
 * only matches the same single word.
 */
export function sameName(expected: string | null | undefined, found: string | null | undefined): boolean {
  const a = nameTokens(expected);
  const b = nameTokens(found);
  if (!a.length || !b.length) return false;
  if (a.length === 1 || b.length === 1) return a.length === b.length && a[0] === b[0];
  return a[0] === b[0] && a[a.length - 1] === b[b.length - 1];
}

export interface ThreadHeader {
  /** Lines of the conversation header's text (name first, then status lines). */
  lines: string[];
  /** Profile links in the header. */
  profileLinks: string[];
}

/**
 * Whether a conversation header names the person we meant to message: a
 * header profile link with the same public id, or a header line with the
 * same first and last name.
 */
export function headerMatchesRecipient(header: ThreadHeader, expected: { name: string | null; id: string | null }): boolean {
  if (expected.id && header.profileLinks.some((href) => linksToProfile(href, expected.id!))) return true;
  if (!expected.name) return false;
  return header.lines.slice(0, 4).some((l) => sameName(expected.name, l));
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// --- Sent-message verification ----------------------------------------------

export interface Bubble {
  text: string;
  /** true: yours; false: the other person's; null: can't tell. */
  own: boolean | null;
}

/** Bubbles that could be yours and show our text. */
export function countOwnMatching(bubbles: readonly Bubble[], text: string): number {
  return bubbles.filter((b) => b.own !== false && containsText(b.text, text)).length;
}

/**
 * A message was sent when a new bubble of yours with our text appeared.
 * Counting rather than searching means an earlier identical message, already
 * in the thread, can't pass as this one.
 */
export function newOwnBubble(before: readonly Bubble[], after: readonly Bubble[], text: string): boolean {
  return countOwnMatching(after, text) > countOwnMatching(before, text);
}
