/**
 * Labels for posts that weren't planned in the calendar: the kind of hook and
 * the writing method, inferred from the text alone. Heuristics, so reports
 * mark them as inferred.
 */

export const HOOK_TYPES = ["announcement", "question", "list", "how_to", "contrarian", "story", "number", "quote", "statement"] as const;
export type HookType = (typeof HOOK_TYPES)[number];

const ANNOUNCEMENT = /^(i'?m|i\s+am|we'?re|we\s+are)\s+(so\s+)?(excited|thrilled|happy|proud|pleased|delighted|honou?red)\b|^(big|exciting|some)\s+news\b|^announcing\b|^(today|this\s+week)\s*,?\s+(we|i)\s+(launched|shipped|joined|released|started)\b/i;
const LIST = /^\d+\s+(\w+\s+)?(ways|lessons|things|mistakes|tips|reasons|steps|rules|habits|questions|signs|tools|books|truths|ideas|myths|principles|frameworks|takeaways|learnings)\b/i;
const HOW_TO = /^how\s+(i|we|to|you)\b/i;
const CONTRARIAN = /\b(unpopular\s+opinion|hot\s+take|stop\s+\w+ing|is\s+dead|are\s+dead|is\s+overrated|myth|nobody\s+tells\s+you|no\s+one\s+talks\s+about|is\s+a\s+lie|wrong\s+about|controversial)\b/i;
const STORY = /^(in\s+(19|20)\d{2}\b|\d+\s+(years?|months?|weeks?|days?)\s+ago\b|yesterday\b|last\s+(week|month|year|night|summer|winter|spring|autumn|fall)\b|when\s+i\b|i\s+was\b|i\s+got\b|i\s+lost\b|i\s+quit\b|i\s+spent\b|i\s+(just\s+)?(failed|left|joined|started|built|hired|fired|made|broke|learned|realised|realized)\b|my\s+(first|boss|manager|daughter|son|dad|mum|mom|father|mother|co-?founder)\b)/i;

export function hookType(firstLine: string | null | undefined): HookType {
  const line = (firstLine ?? "").trim().replace(/[‘’]/g, "'");
  if (!line) return "statement";
  if (ANNOUNCEMENT.test(line)) return "announcement";
  if (LIST.test(line)) return "list";
  if (HOW_TO.test(line)) return "how_to";
  if (/\?\s*\S{0,3}$/u.test(line)) return "question";
  if (CONTRARIAN.test(line)) return "contrarian";
  if (STORY.test(line)) return "story";
  if (/^["“'‘]/.test(line)) return "quote";
  if (/\d/.test(line)) return "number";
  return "statement";
}

/** The writing method, as used in ideas and calendar slots. */
export function inferMethod(text: string | null | undefined): string {
  const body = (text ?? "").replace(/[‘’]/g, "'");
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
  const first = lines[0] ?? "";
  const type = hookType(first);
  const listLines = lines.filter((l) => /^(\d{1,2}[.)]|[-•*→✅👉]|\p{Extended_Pictographic})\s*/u.test(l)).length;
  if (type === "announcement") return "announcement";
  if (type === "how_to") return "how-to";
  if (type === "list" || listLines >= 3) return "listicle";
  if (type === "contrarian") return "contrarian";
  const pastTense = (body.match(/\b(i|we)\s+\w+ed\b/gi) ?? []).length;
  if (type === "story" || pastTense >= 3) return "story";
  if (type === "question" && body.length < 400) return "question";
  return "insight";
}
