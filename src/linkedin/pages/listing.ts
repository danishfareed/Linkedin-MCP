import type { Page } from "patchright";
import type { Nav } from "../../browser/session.js";
import { extractSnapshots, findOptional, waitForAny } from "../dom.js";
import { ensureListLoaded } from "../loaded.js";
import { type ExtractSpec, LIST_SEL } from "../selectors.js";
import type { Snapshot } from "../snapshot.js";

/**
 * A list read from LinkedIn. `complete` is false when fewer items than asked
 * for came back, and `note` says why, so an assistant never mistakes a
 * partial or failed read for "that's everything".
 */
export interface ListResult<T> {
  items: T[];
  complete: boolean;
  note?: string;
}

export interface CollectOptions<T> {
  spec: ExtractSpec;
  /** Plural noun used in errors and notes, e.g. "feed posts". */
  name: string;
  /** Turns the current page's snapshots into items. Called once per round. */
  parse: (snapshots: Snapshot[]) => T[];
  /** Identity used to merge rounds, so lists that unload off-screen items still accumulate. */
  key: (item: T) => string;
  limit: number;
  /** Scroll or "load more" rounds after the first read. */
  maxRounds: number;
  /** How long to wait for the first container. */
  waitMs?: number;
  /** Extra "this list is empty" wording that LinkedIn uses on this page. */
  emptyText?: RegExp;
  /** Custom scrolling, e.g. inside a results column instead of the window. */
  scroll?: (nav: Nav) => Promise<void>;
  /** Click "Show more results" / "Load more" buttons when present. Default true. */
  loadMore?: boolean;
}

/** Rounds in a row that add nothing before we decide LinkedIn has stopped loading. */
const STALL_ROUNDS = 2;

/** Empty activity pages ("Jane hasn’t posted yet"), including the curly apostrophe LinkedIn uses. */
export const NO_POSTS_TEXT = /has(n['’]t| not) posted|no (posts|activity) yet|(hasn['’]t|has not|haven['’]t|have not) (posted|shared) anything|no recent (posts|activity)|no posts to show/i;

export async function mainText(page: Page): Promise<string> {
  return (await page
    .evaluate(`(() => { const m = document.querySelector("main") || document.body; return (m && m.innerText || "").slice(0, 8000); })()`)
    .catch(() => "")) as string;
}

export async function collectList<T>(nav: Nav, o: CollectOptions<T>): Promise<ListResult<T>> {
  const found = await waitForAny(nav.page, o.spec.container, o.waitMs ?? 15_000);
  if (!found) {
    // Nothing matched: don't scroll a page we can't read. Either LinkedIn says
    // the list is empty, or this throws TIMEOUT / SELECTOR_BROKEN.
    if (!(o.emptyText && o.emptyText.test(await mainText(nav.page)))) await ensureListLoaded(nav.page, false, o.name);
    return { items: [], complete: true, note: `LinkedIn shows no ${o.name} here.` };
  }

  const items: T[] = [];
  const seen = new Set<string>();
  let stalls = 0;
  let containers = 0;
  for (let round = 0; ; round++) {
    let added = 0;
    const snapshots = await extractSnapshots(nav.page, o.spec);
    containers = Math.max(containers, snapshots.length);
    for (const item of o.parse(snapshots)) {
      const k = o.key(item);
      if (seen.has(k)) continue;
      seen.add(k);
      items.push(item);
      added++;
    }
    if (items.length >= o.limit) return { items: items.slice(0, o.limit), complete: true };
    stalls = round > 0 && added === 0 ? stalls + 1 : 0;
    const stalled = stalls >= STALL_ROUNDS;
    if (stalled || round >= o.maxRounds) return { items, complete: false, note: partialNote(o.name, o.limit, o.maxRounds, items.length, containers, stalled) };
    await (o.scroll ?? defaultScroll)(nav);
    if (o.loadMore !== false) await clickLoadMore(nav);
  }
}

function partialNote(name: string, limit: number, maxRounds: number, got: number, containers: number, stalled: boolean): string {
  if (got === 0) {
    return (
      `LinkedIn showed ${containers} list item${containers === 1 ? "" : "s"} but none could be read as ${name}. ` +
      "If you expected some, LinkedIn may have changed its layout: run `npx @danishfareed/linkedin-mcp doctor`."
    );
  }
  if (stalled) {
    return `LinkedIn stopped loading more ${name} after ${got} (${limit} requested). That may be all there is, or LinkedIn may be loading slowly.`;
  }
  return `Stopped after ${maxRounds} scrolls with ${got} of the ${limit} ${name} requested. There may be more on LinkedIn.`;
}

async function defaultScroll(nav: Nav): Promise<void> {
  await nav.pacer.scroll(nav.page, 2);
}

/** Clicks a visible "Show more results" button, if the list has one. Returns whether it clicked. */
export async function clickLoadMore(nav: Nav): Promise<boolean> {
  const button = await findOptional(nav.page, LIST_SEL.loadMore, { timeout: 0 });
  if (!button) return false;
  await nav.pacer.beat();
  const clicked = await button.click({ timeout: 5000 }).then(
    () => true,
    () => false,
  );
  if (clicked) await nav.pacer.beat(1200, 2400);
  return clicked;
}

/** Spreads a ListResult into a tool result under a named key, dropping an empty note. */
export function listOf<K extends string, T>(key: K, r: ListResult<T>): { [P in K]: T[] } & { complete: boolean; note?: string } {
  return { [key]: r.items, complete: r.complete, ...(r.note ? { note: r.note } : {}) } as { [P in K]: T[] } & { complete: boolean; note?: string };
}
