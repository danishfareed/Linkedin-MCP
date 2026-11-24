import type { Snapshot } from "../snapshot.js";
import { cleanLink } from "../urls.js";
import { cleanBody, cleanText, lines, relativeTime } from "./text.js";

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
