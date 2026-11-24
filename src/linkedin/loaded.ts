import type { Page } from "patchright";
import { LinkedInMcpError, selectorBroken } from "../errors.js";

/**
 * Phrases LinkedIn shows when a list is genuinely empty. Matched against the
 * main content's text, so a real "nothing here" isn't reported as broken.
 */
const EMPTY_STATE =
  /no results found|no matching results|try (a different|different) (search|keywords)|no new notifications|you're all caught up|no messages yet|you have no (new )?messages|no pending invitations|no invitations|nothing to see|no posts yet|hasn['’]t posted|no recent activity|no (matching )?jobs found|no saved jobs|there are no/i;

/**
 * Call after waiting for a list's containers. If none appeared, decide whether
 * the list is really empty or the page didn't render what we expected, instead
 * of silently returning [] (which an assistant reads as "nothing there").
 *
 * - containers found: returns.
 * - LinkedIn's own empty-state text present: returns (a real empty list).
 * - main content has text but no containers: throws SELECTOR_BROKEN.
 * - page is essentially blank: throws TIMEOUT (it never finished loading).
 */
export async function ensureListLoaded(page: Page, found: boolean, name: string): Promise<void> {
  if (found) return;
  const text = (await page
    .evaluate(`(() => { const m = document.querySelector("main") || document.body; return (m && m.innerText || "").slice(0, 8000); })()`)
    .catch(() => "")) as string;
  if (isEmptyState(text)) return;
  if (text.replace(/\s+/g, " ").trim().length < 80) {
    throw new LinkedInMcpError(
      "TIMEOUT",
      `The LinkedIn page for ${name} didn't finish loading.`,
      "Try again in a minute. If it keeps happening, run `npx @danishfareed/linkedin-mcp doctor`.",
      { list: name, url: page.url() },
    );
  }
  throw selectorBroken(name, { reason: "the page loaded but none of its list items were recognised", url: page.url() });
}

export function isEmptyState(text: string): boolean {
  return EMPTY_STATE.test(text);
}
