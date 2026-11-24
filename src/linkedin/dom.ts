import type { Locator, Page } from "patchright";
import { currentDeadline } from "../browser/deadline.js";
import { selectorBroken } from "../errors.js";
import type { PageSignals } from "../safety/guard.js";
import type { Candidate, ExtractSpec, SelectorEntry } from "./selectors.js";
import { SEL } from "./selectors.js";
import type { Snapshot } from "./snapshot.js";

type Scope = Page | Locator;

function locatorFor(scope: Scope, c: Candidate): Locator {
  if ("role" in c) {
    return scope.getByRole(c.role, c.name === undefined ? {} : { name: c.name, exact: c.exact ?? false });
  }
  if ("label" in c) return scope.getByLabel(c.label);
  if ("placeholder" in c) return scope.getByPlaceholder(c.placeholder);
  if ("text" in c) return scope.getByText(c.text);
  return scope.locator(c.css);
}

/**
 * A wait's timeout, capped to what is left of the current call's budget.
 * Never 0, which Playwright reads as "no timeout".
 */
function budgeted(timeout: number): number {
  const deadline = currentDeadline();
  return deadline ? Math.max(1, deadline.clamp(timeout)) : timeout;
}

/**
 * Returns the first visible match from the entry's candidate list, polling
 * until `timeout`. Throws SELECTOR_BROKEN with the entry name if none appear,
 * or TIMEOUT if the call's time budget ran out first (the element may well
 * exist; we just stopped looking).
 */
export async function find(scope: Scope, sel: SelectorEntry, opts: { timeout?: number } = {}): Promise<Locator> {
  const found = await findOptional(scope, sel, opts);
  if (!found) {
    currentDeadline()?.check(`looking for "${sel.name}"`);
    throw selectorBroken(sel.name);
  }
  return found;
}

/** Like `find`, but returns null when nothing appears. The wait is capped to the call's time budget. */
export async function findOptional(scope: Scope, sel: SelectorEntry, opts: { timeout?: number } = {}): Promise<Locator | null> {
  const deadline = Date.now() + budgeted(opts.timeout ?? 10_000);
  for (;;) {
    for (const c of sel.candidates) {
      const loc = locatorFor(scope, c);
      const count = await loc.count().catch(() => 0);
      for (let i = 0; i < Math.min(count, 5); i++) {
        const nth = loc.nth(i);
        if (await nth.isVisible().catch(() => false)) return nth;
      }
    }
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 250));
  }
}

/**
 * The in-page extractor. Kept as a plain JavaScript string so that no
 * bundler or transpiler helper can leak into the browser context.
 */
const EXTRACT_SCRIPT = String.raw`
(spec) => {
  const MAX_TEXT = 20000;
  const pickAll = (root, list) => {
    for (const css of list) {
      try {
        const els = Array.from(root.querySelectorAll(css));
        if (els.length) return els;
      } catch (e) { /* invalid selector in this engine; try next */ }
    }
    return [];
  };
  const pickOne = (root, list) => {
    for (const css of list) {
      try {
        const el = css === ":scope" ? root : root.querySelector(css);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  };
  const textOf = (el) => {
    if (!el) return null;
    const t = (el.innerText || el.textContent || "").trim();
    return t ? t.slice(0, MAX_TEXT) : null;
  };
  const urnOf = (el) => {
    const attrs = ["data-urn", "data-id", "data-chameleon-result-urn", "data-entity-urn", "data-activity-urn"];
    for (const a of attrs) { const v = el.getAttribute(a); if (v && v.indexOf("urn:li:") === 0) return v; }
    const inner = el.querySelector("[data-urn^='urn:li:'], [data-id^='urn:li:']");
    if (inner) return inner.getAttribute("data-urn") || inner.getAttribute("data-id");
    return null;
  };

  let containers = pickAll(document, spec.container);
  const set = new Set(containers);
  const depthOf = (el) => { let d = 0; let p = el.parentElement; while (p) { if (set.has(p)) d++; p = p.parentElement; } return d; };
  let withDepth = containers.map((el) => ({ el, depth: depthOf(el) }));
  if (!spec.keepNested) withDepth = withDepth.filter((x) => x.depth === 0);
  if (spec.limit) withDepth = withDepth.slice(0, spec.limit);

  return withDepth.map(({ el, depth }) => {
    const links = Array.from(el.querySelectorAll("a[href]")).slice(0, 60).map((a) => ({
      href: a.href,
      text: (a.innerText || "").trim().slice(0, 200),
      label: a.getAttribute("aria-label"),
    }));
    const labels = Array.from(new Set(Array.from(el.querySelectorAll("[aria-label]")).map((n) => n.getAttribute("aria-label")).filter(Boolean))).slice(0, 80);
    const fields = {};
    for (const [name, list] of Object.entries(spec.fields || {})) fields[name] = textOf(pickOne(el, list));
    const attrs = {};
    for (const [name, def] of Object.entries(spec.attrs || {})) {
      const n = pickOne(el, def.css);
      attrs[name] = n ? n.getAttribute(def.attr) : null;
    }
    let items = [];
    if (spec.items) {
      const all = pickAll(el, spec.items);
      const itemSet = new Set(all);
      const top = all.filter((it) => { let p = it.parentElement; while (p && p !== el) { if (itemSet.has(p)) return false; p = p.parentElement; } return true; });
      items = top.map(textOf).filter(Boolean).slice(0, 50);
    }
    return { urn: urnOf(el), depth, text: textOf(el) || "", links, labels, fields, attrs, items };
  });
}
`;

export async function extractSnapshots(page: Page, spec: ExtractSpec): Promise<Snapshot[]> {
  return page.evaluate(`(${EXTRACT_SCRIPT})(${JSON.stringify(spec)})`) as Promise<Snapshot[]>;
}

/**
 * Waits until at least one container from the spec is present. Returns false
 * on timeout, or throws TIMEOUT if the call's time budget ran out first, so an
 * unfinished wait isn't mistaken for an empty list or a changed layout.
 */
export async function waitForAny(page: Page, css: readonly string[], timeout = 15_000): Promise<boolean> {
  try {
    await page.waitForSelector(css.join(", "), { state: "attached", timeout: budgeted(timeout) });
    return true;
  } catch {
    currentDeadline()?.check("page_wait");
    return false;
  }
}

/** LinkedIn's "Welcome back" account picker, shown in every language once the session has expired. */
export const REMEMBER_ME_CSS = "#rememberme-div";

/**
 * Cheap signals for the guard: URL, title, first few KB of text, whether the
 * signed-in nav exists and whether the "Welcome back" account picker is shown.
 */
export async function readPageSignals(page: Page): Promise<PageSignals> {
  const navCss = SEL.globalNav.candidates.filter((c): c is { css: string } => "css" in c).map((c) => c.css);
  const result = (await page
    .evaluate(
      `(() => ({ title: document.title, text: (document.body && document.body.innerText || "").slice(0, 6000), hasGlobalNav: !!document.querySelector(${JSON.stringify(navCss.join(", "))}), rememberMe: !!document.querySelector(${JSON.stringify(REMEMBER_ME_CSS)}) }))()`,
    )
    .catch(() => ({ title: "", text: "", hasGlobalNav: undefined, rememberMe: undefined }))) as { title: string; text: string; hasGlobalNav?: boolean; rememberMe?: boolean };
  return { url: page.url(), ...result };
}
