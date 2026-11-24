/**
 * Pure helpers that decide whether a write actually landed, from what the
 * page shows before and after the final click.
 */

const URL_RE = /https?:\/\/\S+/gi;
const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/g;

/**
 * Text as compared for verification: NFC, zero-width characters and URLs
 * removed (LinkedIn may shorten or unfurl links), whitespace collapsed.
 */
export function normaliseForMatch(text: string | null | undefined): string {
  if (!text) return "";
  return text.normalize("NFC").replace(ZERO_WIDTH, "").replace(URL_RE, " ").replace(/\s+/g, " ").trim();
}

/**
 * The part of our text we look for on the page: its normalised beginning.
 * Long comments and posts are truncated behind "…see more", so the head is
 * what's reliably visible.
 */
export function textProbe(text: string, maxChars = 100): string {
  const n = normaliseForMatch(text);
  return [...n].slice(0, maxChars).join("").trim();
}

/** `maxChars` is how much of our text's beginning must be visible (shorter for list previews). */
export function containsText(haystack: string | null | undefined, text: string, maxChars = 100): boolean {
  const probe = textProbe(text, maxChars);
  if (!probe) return false;
  return normaliseForMatch(haystack).includes(probe);
}

/** How many items show our text. */
export function countMatching(items: readonly (string | null | undefined)[], text: string): number {
  return items.filter((t) => containsText(t, text)).length;
}

/**
 * A new item with our text appeared. Counting before and after, rather than
 * just looking for the text, means an earlier identical message or comment
 * can't pass as the new one.
 */
export function newMatchingItem(before: readonly (string | null | undefined)[], after: readonly (string | null | undefined)[], text: string): boolean {
  return countMatching(after, text) > countMatching(before, text);
}

/**
 * Whether the typed text actually landed in the editor before we send:
 * the editor must contain the beginning of what was approved.
 */
export function editorHolds(editorText: string | null | undefined, text: string): boolean {
  return containsText(editorText, text);
}

export interface ReactionState {
  pressed: string | null;
  label: string | null;
  text: string | null;
}

/**
 * Whether the reaction control now shows a reaction: aria-pressed flipped to
 * true, or its label/text changed to a reacted state or to the reaction name.
 */
export function reactionApplied(before: ReactionState, after: ReactionState, reaction: string, reacted: RegExp, notReacted: RegExp): boolean {
  if (after.pressed === "true" && before.pressed !== "true") return true;
  const label = (after.label ?? "").trim();
  if (label && label !== (before.label ?? "").trim()) {
    if (reacted.test(label)) return true;
    if (new RegExp(`\\b${reaction}\\b`, "i").test(label) && !notReacted.test(label)) return true;
  }
  const text = (after.text ?? "").trim();
  if (reaction !== "like" && text && text !== (before.text ?? "").trim() && new RegExp(`^${reaction}$`, "i").test(text)) return true;
  return false;
}

/** Already reacted before we did anything. */
export function alreadyReacted(state: ReactionState, reacted: RegExp): boolean {
  return state.pressed === "true" || reacted.test((state.label ?? "").trim());
}
