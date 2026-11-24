import type { Page } from "patchright";
import { LinkedInMcpError } from "../errors.js";

/**
 * Language gate for write actions.
 *
 * LinkedIn renders in the account's display language, not the browser's, and
 * write actions still find some controls by their English labels. Rather than
 * fail half-way through a send, every write page-function checks the page
 * language right after its first navigation and stops before any click or
 * keystroke. Reads are not gated.
 */

export type LanguageCheck =
  | { ok: true; lang: string | null }
  | { ok: false; lang: string };

/** "en-US", "en_GB", "EN" → "en". Empty or missing → null (unknown). */
export function baseLanguage(lang: string | null | undefined): string | null {
  const first = (lang ?? "").trim().toLowerCase().split(/[-_]/)[0] ?? "";
  return /^[a-z]{2,3}$/.test(first) ? first : null;
}

/**
 * Pure decision. An unknown language is allowed: LinkedIn always sets
 * `<html lang>`, so a missing value says more about the page than the
 * account, and blocking on it would stop every write if LinkedIn dropped it.
 */
export function checkLanguage(lang: string | null | undefined): LanguageCheck {
  const base = baseLanguage(lang);
  if (base === null || base === "en") return { ok: true, lang: base };
  return { ok: false, lang: (lang ?? "").trim() };
}

/** "de" → "German". Falls back to the code itself. */
export function languageName(lang: string): string {
  const base = baseLanguage(lang) ?? lang;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(base) ?? lang;
  } catch {
    return lang;
  }
}

export function unsupportedLanguage(lang: string): LinkedInMcpError {
  return new LinkedInMcpError(
    "UNSUPPORTED_LANGUAGE",
    `LinkedIn is showing its interface in ${languageName(lang)} (${lang}). linkedin-mcp's write actions only work with LinkedIn's English interface, so nothing was clicked or sent.`,
    "Switch LinkedIn's display language to English (on LinkedIn: Settings → Account preferences → Display language), then try again. Reading tools keep working in any language.",
    { lang },
  );
}

/** Reads `document.documentElement.lang` (shared DOM, so the isolated world sees it). */
export async function pageLanguage(page: Page): Promise<string> {
  const lang = await page
    .evaluate(`(() => (document.documentElement && document.documentElement.getAttribute("lang")) || "")()`)
    .catch(() => "");
  return typeof lang === "string" ? lang : "";
}

/**
 * Call at the start of every write page-function, after the first navigation
 * and before typing or clicking anything. Throws UNSUPPORTED_LANGUAGE.
 */
export async function assertEnglish(page: Page): Promise<void> {
  const check = checkLanguage(await pageLanguage(page));
  if (!check.ok) throw unsupportedLanguage(check.lang);
}
