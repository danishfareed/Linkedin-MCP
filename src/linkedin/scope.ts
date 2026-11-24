import type { Locator, Page } from "patchright";
import type { Nav } from "../browser/session.js";
import { selectorBroken } from "../errors.js";
import { DIALOG, DIALOG_EXCLUDE_INSIDE, EDITABLE, HREF, INVITE_DIALOG, LOAD_MORE, TOP_CARD } from "./anchors.js";
import { findOptional } from "./dom.js";
import type { Bubble, ThreadHeader } from "./parse/inbox.js";
import type { InviteDialogSnapshot, TopCardSnapshot } from "./parse/invite.js";
import { cleanText } from "./parse/text.js";
import type { ReactionState } from "./parse/verify.js";
import { SEL } from "./selectors.js";

/**
 * Scoping helpers for write actions: the profile top card, the dialog that
 * just opened, the conversation an editor belongs to. Everything a write
 * clicks is looked up inside one of these, never page-wide.
 *
 * In-page readers are plain JavaScript strings turned into functions, like
 * the extractor in dom.ts, so no transpiler helper can leak into the page.
 * Their bodies are fixed constants; every variable value goes in through
 * `arg`, never into the source.
 */

type InPage<A, R> = (el: Element, arg: A) => R;
type InPageAll<A, R> = (els: Element[], arg: A) => R;

const HELPERS = String.raw`
  const visible = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
  const clean = (s) => (s || "").replace(/\s+/g, " ").trim().slice(0, 300);
`;

function inPage<A, R>(body: string): InPage<A, R> {
  return new Function("el", "arg", HELPERS + body) as InPage<A, R>;
}

function inPageAll<A, R>(body: string): InPageAll<A, R> {
  return new Function("els", "arg", HELPERS + body) as InPageAll<A, R>;
}

const READ_TOP_CARD = inPage<undefined, TopCardSnapshot>(String.raw`
  const heading = el.querySelector("h1") || el.querySelector("h2");
  return {
    name: heading ? clean(heading.innerText || heading.textContent) || null : null,
    links: Array.from(el.querySelectorAll("a[href]")).slice(0, 80).map((a) => ({ href: a.href, label: clean(a.getAttribute("aria-label")), text: clean(a.innerText), visible: visible(a) })),
    buttons: Array.from(el.querySelectorAll("button")).slice(0, 40).map((b) => ({ label: clean(b.getAttribute("aria-label")), text: clean(b.innerText), visible: visible(b), disabled: !!b.disabled || b.getAttribute("aria-disabled") === "true" })),
  };
`);

const READ_INVITE_DIALOG = inPage<{ noteBox: string; email: string; premium: string }, InviteDialogSnapshot>(String.raw`
  const box = Array.from(el.querySelectorAll(arg.noteBox)).find(visible) || null;
  const email = Array.from(el.querySelectorAll(arg.email)).find(visible) || null;
  const premium = Array.from(el.querySelectorAll(arg.premium)).filter(visible).length;
  const actions = Array.from(el.querySelectorAll("button")).filter(visible)
    .map((b) => ({ text: clean(b.innerText), label: clean(b.getAttribute("aria-label")), disabled: !!b.disabled || b.getAttribute("aria-disabled") === "true" }))
    .filter((b) => b.text);
  return { noteBox: !!box, noteMax: box && box.maxLength > 0 ? box.maxLength : null, emailInput: !!email, premiumLinks: premium, actions };
`);

const READ_THREAD_HEADER = inPage<undefined, ThreadHeader>(String.raw`
  const header = el.querySelector("header") || el.querySelector("h2");
  const root = header || el;
  const lines = (root.innerText || "").split(/\n+/).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
  const profileLinks = Array.from(root.querySelectorAll("a[href*='/in/']")).map((a) => a.href).slice(0, 10);
  return { lines, profileLinks };
`);

const READ_BUBBLES = inPageAll<undefined, Bubble[]>(String.raw`
  return els.map((li) => {
    const cls = (n) => (n && typeof n.className === "string" ? n.className : "");
    const other = /--other\b/.test(cls(li)) || !!li.querySelector("[class*='--other']");
    const known = /event-listitem/.test(cls(li)) || !!li.querySelector("[class*='event-listitem']");
    return { text: (li.innerText || "").slice(0, 20000), own: other ? false : known ? true : null };
  });
`);

const READ_OWN_TEXTS = inPageAll<{ nested: string; editable: string }, string[]>(String.raw`
  return els.map((el) => {
    const c = el.cloneNode(true);
    c.querySelectorAll(arg.nested).forEach((n) => n.remove());
    c.querySelectorAll(arg.editable).forEach((n) => n.remove());
    return (c.textContent || "").replace(/\s+/g, " ").trim().slice(0, 20000);
  });
`);

const READ_REACTION = inPage<undefined, ReactionState>(String.raw`
  return { pressed: el.getAttribute("aria-pressed"), label: el.getAttribute("aria-label"), text: clean(el.innerText) };
`);

const NEWEST_DIALOG_INDEX = (css: string, exclude: string): string => `(() => {
  const visible = (n) => !!(n && (n.offsetWidth || n.offsetHeight || n.getClientRects().length));
  const all = Array.from(document.querySelectorAll(${JSON.stringify(css)}));
  let idx = -1;
  all.forEach((d, i) => { if (visible(d) && !d.closest(${JSON.stringify(exclude)})) idx = i; });
  return idx;
})()`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Profile top card -------------------------------------------------------

/** The section holding the profile's name heading (h1, or h2 in the 2026 layout). */
export async function topCard(page: Page, timeout = 10_000): Promise<Locator> {
  const deadline = Date.now() + timeout;
  for (;;) {
    for (const css of TOP_CARD) {
      const loc = page.locator(css).first();
      if ((await loc.count().catch(() => 0)) > 0) return loc;
    }
    if (Date.now() >= deadline) throw selectorBroken("profile.topCard");
    await sleep(250);
  }
}

export async function readTopCard(card: Locator): Promise<TopCardSnapshot> {
  const snap = await card.evaluate(READ_TOP_CARD, undefined);
  return { ...snap, name: cleanText(snap.name) };
}

// --- Dialogs ----------------------------------------------------------------

/** The most recently opened visible modal dialog, ignoring message overlays. */
export async function newestDialog(page: Page): Promise<Locator | null> {
  const idx = (await page.evaluate(NEWEST_DIALOG_INDEX(DIALOG, DIALOG_EXCLUDE_INSIDE)).catch(() => -1)) as number;
  return idx >= 0 ? page.locator(DIALOG).nth(idx) : null;
}

export async function waitForDialog(page: Page, timeout: number): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  for (;;) {
    const d = await newestDialog(page);
    if (d) return d;
    if (Date.now() >= deadline) return null;
    await sleep(250);
  }
}

/** Waits for every modal dialog to close. */
export async function waitForNoDialog(page: Page, timeout: number): Promise<boolean> {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (!(await newestDialog(page))) return true;
    if (Date.now() >= deadline) return false;
    await sleep(250);
  }
}

/**
 * Before starting a flow whose next dialog matters, close any dialog left
 * open, so "the dialog that opened after the click" is unambiguous.
 */
export async function dismissStrayDialogs(nav: Nav): Promise<void> {
  for (let i = 0; i < 2; i++) {
    if (!(await newestDialog(nav.page))) return;
    await nav.page.keyboard.press("Escape");
    await nav.pacer.beat(400, 800);
  }
  if (await newestDialog(nav.page)) throw selectorBroken("dialog.dismiss", { reason: "a LinkedIn dialog was already open and couldn't be closed" });
}

/** Best effort: close a dialog we decided not to go through with. */
export async function closeDialog(nav: Nav, dialog: Locator): Promise<void> {
  const dismiss = await findOptional(dialog, SEL.composer.dismiss, { timeout: 1000 });
  if (dismiss) await dismiss.click().catch(() => undefined);
  else await nav.page.keyboard.press("Escape").catch(() => undefined);
  await nav.pacer.beat(300, 700);
}

export async function readInviteDialog(dialog: Locator): Promise<InviteDialogSnapshot> {
  return dialog.evaluate(READ_INVITE_DIALOG, { noteBox: INVITE_DIALOG.noteBox, email: INVITE_DIALOG.email, premium: HREF.premiumCss });
}

/** The visible, labelled buttons of a dialog, in order. The last one is the primary action. */
export function dialogActions(dialog: Locator): Locator {
  return dialog.locator("button:visible").filter({ hasText: /\S/ });
}

// --- Messaging --------------------------------------------------------------

/** Closes leftover message overlays, so the one we open is the only one. Returns how many were closed. */
export async function closeMessageOverlays(nav: Nav): Promise<number> {
  let closed = 0;
  for (let i = 0; i < 6; i++) {
    const close = await findOptional(nav.page, SEL.messaging.closeOverlay, { timeout: i === 0 ? 1200 : 600 });
    if (!close) break;
    await close.click().catch(() => undefined);
    closed++;
    await nav.pacer.beat(300, 700);
  }
  return closed;
}

export async function readThreadHeader(thread: Locator): Promise<ThreadHeader> {
  return thread.evaluate(READ_THREAD_HEADER, undefined);
}

export async function readBubbles(thread: Locator, containerCss: readonly string[]): Promise<Bubble[]> {
  return thread.locator(containerCss.join(", ")).evaluateAll(READ_BUBBLES, undefined);
}

// --- Comments and reactions -------------------------------------------------

/** Each matched item's own text, without nested items (replies) or editors. */
export async function readOwnTexts(scope: Locator, containerCss: readonly string[]): Promise<string[]> {
  const css = containerCss.join(", ");
  return scope.locator(css).evaluateAll(READ_OWN_TEXTS, { nested: css, editable: EDITABLE });
}

export async function readReactionState(button: Locator): Promise<ReactionState> {
  return button.evaluate(READ_REACTION, undefined);
}

// --- Lists ------------------------------------------------------------------

/** Clicks a "Show more results" / "Load more" button in `scope` if there is one. */
export async function clickLoadMore(nav: Nav, scope: Page | Locator): Promise<boolean> {
  const more = await findOptional(scope, LOAD_MORE, { timeout: 800 });
  if (!more || !(await more.isEnabled().catch(() => false))) return false;
  await more.click().catch(() => undefined);
  await nav.pacer.beat(1200, 2400);
  return true;
}
