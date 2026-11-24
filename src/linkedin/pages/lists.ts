import type { Locator } from "patchright";
import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError, selectorBroken } from "../../errors.js";
import { FORM_FROM_EDITOR, PROFILE_READY, THREAD_FROM_EDITOR } from "../anchors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { assertEnglish } from "../language.js";
import { ensureListLoaded } from "../loaded.js";
import { type WriteResult, notSent, pollUntil, runWrite, sent, unconfirmed } from "../outcome.js";
import { PROFILE_METRICS, type Metric, readMetrics } from "../parse/analytics.js";
import {
  type ConversationSummary,
  type Invitation,
  type Message,
  type Notification,
  type ThreadHeader,
  headerMatchesRecipient,
  newOwnBubble,
  parseConversation,
  parseInvitation,
  parseMessages,
  parseNotification,
} from "../parse/inbox.js";
import { profileIdFromUrl } from "../parse/invite.js";
import { type ListResult, finishList, listEnded } from "../parse/list.js";
import { type CompanyResult, type PersonResult, parseCompanyResult, parsePersonResult, parseResults } from "../parse/search.js";
import { editorHolds } from "../parse/verify.js";
import { clickLoadMore, closeMessageOverlays, readBubbles, readThreadHeader, readTopCard, topCard } from "../scope.js";
import { EXTRACT, type ExtractSpec, SEL } from "../selectors.js";
import type { Snapshot } from "../snapshot.js";
import { type PeopleFilters, profileId, profileUrl, searchCompaniesUrl, searchPeopleUrl, threadUrl, urls } from "../urls.js";

interface CollectOptions {
  /** Used in errors and the completeness note ("notifications"). */
  what: string;
  /** Load-more clicks or scrolls after the first read. */
  maxRounds: number;
  /** Scroll the list's own pane (hover its last item first) rather than the page. */
  paneScroll?: boolean;
  /** One page only by design (search): the list counts as complete after it. */
  onePage?: boolean;
}

async function scrollList(nav: Nav, spec: ExtractSpec, paneScroll: boolean): Promise<void> {
  if (paneScroll) {
    await nav.page
      .locator(spec.container.join(", "))
      .last()
      .hover({ timeout: 2000 })
      .catch(() => undefined);
  }
  await nav.pacer.scroll(nav.page, 1);
}

/**
 * Reads a list, clicking LinkedIn's "Show more results"/"Load more" button
 * where there is one and scrolling otherwise, until `limit` items are found,
 * the list ends, or `maxRounds` is used up (then `complete` is false).
 * A list whose items never appeared throws instead of returning [] silently.
 */
async function collect<T>(nav: Nav, spec: ExtractSpec, parse: (s: Snapshot[]) => T[], limit: number, opts: CollectOptions): Promise<ListResult<T>> {
  const found = await waitForAny(nav.page, spec.container, 12_000);
  await ensureListLoaded(nav.page, found, opts.what);
  if (!found) return { items: [], complete: true };

  let items = parse(await extractSnapshots(nav.page, spec));
  let rounds = 0;
  let exhausted = Boolean(opts.onePage);
  while (items.length < limit && rounds < opts.maxRounds) {
    rounds++;
    // One-page lists (search) only scroll, so a stray "show more" control is never clicked there.
    const offered = opts.onePage ? false : await clickLoadMore(nav, nav.page.locator("main"));
    if (!offered) await scrollList(nav, spec, Boolean(opts.paneScroll));
    let next = parse(await extractSnapshots(nav.page, spec));
    if (listEnded(items.length, next.length, offered)) {
      // Give slow pages one more moment before calling the list finished.
      await nav.pacer.beat(1000, 1800);
      next = parse(await extractSnapshots(nav.page, spec));
      if (listEnded(items.length, next.length, offered)) {
        items = next;
        exhausted = true;
        break;
      }
    }
    items = next;
  }
  return finishList(items, limit, { rounds, maxRounds: opts.maxRounds, exhausted }, opts.what);
}

function keep<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x !== null);
}

// --- Search -----------------------------------------------------------------

export async function searchPeopleResult(nav: Nav, keywords: string, filters: PeopleFilters, limit: number): Promise<ListResult<PersonResult>> {
  await nav.goto(searchPeopleUrl(keywords, filters), { waitFor: EXTRACT.personResult.container });
  return collect(nav, EXTRACT.personResult, (s) => parseResults(s, parsePersonResult, limit), limit, { what: "people search results", maxRounds: 1, onePage: true });
}

export async function searchCompaniesResult(nav: Nav, keywords: string, limit: number): Promise<ListResult<CompanyResult>> {
  await nav.goto(searchCompaniesUrl(keywords), { waitFor: EXTRACT.companyResult.container });
  return collect(nav, EXTRACT.companyResult, (s) => parseResults(s, parseCompanyResult, limit), limit, { what: "company search results", maxRounds: 1, onePage: true });
}

export async function searchPeople(nav: Nav, keywords: string, filters: PeopleFilters, limit: number): Promise<PersonResult[]> {
  return (await searchPeopleResult(nav, keywords, filters, limit)).items;
}

export async function searchCompanies(nav: Nav, keywords: string, limit: number): Promise<CompanyResult[]> {
  return (await searchCompaniesResult(nav, keywords, limit)).items;
}

// --- Notifications ----------------------------------------------------------

export async function readNotificationsResult(nav: Nav, limit: number): Promise<ListResult<Notification>> {
  await nav.goto(urls.notifications(), { waitFor: EXTRACT.notification.container });
  return collect(nav, EXTRACT.notification, (s) => keep(s.map(parseNotification)), limit, { what: "notifications", maxRounds: 4 });
}

export async function readNotifications(nav: Nav, limit: number): Promise<Notification[]> {
  return (await readNotificationsResult(nav, limit)).items;
}

// --- Analytics --------------------------------------------------------------

export async function readProfileAnalytics(nav: Nav): Promise<{ metrics: Record<string, Metric>; source: string }> {
  await nav.goto(urls.dashboard(), { waitFor: ["main"] });
  const [snap] = await extractSnapshots(nav.page, EXTRACT.page);
  const text = snap?.text ?? "";
  const metrics = readMetrics(text, PROFILE_METRICS);
  if (Object.values(metrics).every((m) => m.value === null)) {
    throw new LinkedInMcpError("SELECTOR_BROKEN", "Could not read analytics from your LinkedIn dashboard.", "Run `npx @danishfareed/linkedin-mcp doctor` and report the result.", { selector: "analytics.dashboard" });
  }
  return { metrics, source: urls.dashboard() };
}

// --- Invitations ------------------------------------------------------------

export async function listInvitationsResult(nav: Nav, direction: "received" | "sent", limit: number): Promise<ListResult<Invitation>> {
  await nav.goto(direction === "received" ? urls.invitationsReceived() : urls.invitationsSent(), { waitFor: EXTRACT.invitation.container });
  return collect(nav, EXTRACT.invitation, (s) => keep(s.map(parseInvitation)), limit, { what: "invitations", maxRounds: 4 });
}

export async function listInvitations(nav: Nav, direction: "received" | "sent", limit: number): Promise<Invitation[]> {
  return (await listInvitationsResult(nav, direction, limit)).items;
}

function cssString(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Links to exactly this public id: `/in/jane/` but not `/in/jane-doe/`. */
function exactProfileLinkCss(publicId: string): string {
  const forms = [...new Set([publicId, encodeURIComponent(publicId)])];
  return forms.flatMap((id) => [`a[href*=${cssString(`/in/${id}/`)}]`, `a[href$=${cssString(`/in/${id}`)}]`, `a[href*=${cssString(`/in/${id}?`)}]`]).join(", ");
}

function invitationCards(nav: Nav, publicId: string): Locator {
  return nav.page.locator(EXTRACT.invitation.container.join(", ")).filter({ has: nav.page.locator(exactProfileLinkCss(publicId)) });
}

/** The invitation card from this person, loading more of the list if needed. */
async function findInvitationCard(nav: Nav, publicId: string): Promise<Locator | null> {
  for (let round = 0; round <= 3; round++) {
    const card = invitationCards(nav, publicId).first();
    if (await card.count()) return card;
    if (round === 3) break;
    if (!(await clickLoadMore(nav, nav.page.locator("main")))) await nav.pacer.scroll(nav.page, 1);
  }
  return null;
}

/** Whether a card from this person still offers Accept or Ignore. */
async function invitationStillOpen(nav: Nav, publicId: string): Promise<boolean> {
  const cards = invitationCards(nav, publicId);
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    if (await findOptional(card, SEL.invitations.accept, { timeout: 200 })) return true;
    if (await findOptional(card, SEL.invitations.ignore, { timeout: 200 })) return true;
  }
  return false;
}

/** Accept or Ignore, clicked inside that person's card only. `sent` once the card changed or disappeared. */
export async function respondToInvitation(nav: Nav, id: string, action: "accept" | "ignore"): Promise<WriteResult> {
  const publicId = profileId(id);
  await nav.goto(urls.invitationsReceived(), { waitFor: EXTRACT.invitation.container });
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
    const found = await waitForAny(nav.page, EXTRACT.invitation.container, 10_000);
    await ensureListLoaded(nav.page, found, "invitations");
    const card = found ? await findInvitationCard(nav, publicId) : null;
    if (!card) {
      throw new LinkedInMcpError("INVALID_INPUT", "No pending invitation from that person was found.", "Call list_invitations to get current invitation ids.", { id: publicId });
    }
    const button = await find(card, action === "accept" ? SEL.invitations.accept : SEL.invitations.ignore, { timeout: 6000 });
    attempt.commit(action);
    await button.click();
    const changed = await pollUntil(async () => !(await invitationStillOpen(nav, publicId)), 8000);
    const status = action === "accept" ? "accepted" : "ignored";
    if (changed) return sent({ status });
    return unconfirmed("card_unchanged", "the invitation card still shows Accept and Ignore", { status });
  });
}

// --- Messaging --------------------------------------------------------------

export async function readInboxResult(nav: Nav, limit: number): Promise<ListResult<ConversationSummary>> {
  await nav.goto(urls.messaging(), { waitFor: EXTRACT.conversation.container });
  return collect(nav, EXTRACT.conversation, (s) => keep(s.map(parseConversation)), limit, { what: "conversations", maxRounds: 2, paneScroll: true });
}

export async function readInbox(nav: Nav, limit: number): Promise<ConversationSummary[]> {
  return (await readInboxResult(nav, limit)).items;
}

interface OpenThread {
  /** The conversation the editor belongs to (overlay or thread pane). */
  thread: Locator;
  editor: Locator;
  header: ThreadHeader;
  /** Who we meant to open, when we went through a profile. */
  expected: { name: string | null; id: string | null } | null;
}

/**
 * Opens a conversation: a thread URL as is, or a profile's own message
 * action from its top card (never a page-wide "Message …" button). Leftover
 * message overlays are closed first, so the one that opens is the only one.
 */
async function openThread(nav: Nav, target: string, write: boolean): Promise<OpenThread> {
  const thread = threadUrl(target);
  if (thread) {
    await nav.goto(thread, { waitFor: EXTRACT.message.container });
    if (write) await assertEnglish(nav.page);
    await closeMessageOverlays(nav);
    const editor = (await findOptional(nav.page.locator("main"), SEL.messaging.editor, { timeout: 8000 })) ?? (await find(nav.page, SEL.messaging.editor, { timeout: 2000 }));
    const scope = editor.locator(THREAD_FROM_EDITOR);
    return { thread: scope, editor, header: await readThreadHeader(scope), expected: null };
  }

  const url = profileUrl(target);
  await nav.goto(url, { waitFor: PROFILE_READY });
  if (write) await assertEnglish(nav.page);
  await closeMessageOverlays(nav);
  const card = await topCard(nav.page);
  const top = await readTopCard(card);
  const expected = { name: top.name, id: profileIdFromUrl(nav.page.url()) ?? profileId(target) };
  const message = await findOptional(card, SEL.profile.message, { timeout: 6000 });
  if (!message) {
    throw new LinkedInMcpError("INVALID_INPUT", "You can't message this person from their profile (usually because you're not connected).", "Send a connection request first, or use a thread URL from get_inbox.", { target });
  }
  await message.click();
  await nav.pacer.beat(1500, 2500);
  const editor = await find(nav.page, SEL.messaging.editor, { timeout: 10_000 });
  const scope = editor.locator(THREAD_FROM_EDITOR);
  return { thread: scope, editor, header: await readThreadHeader(scope), expected };
}

function recipientMismatch(opened: OpenThread): boolean {
  return opened.expected !== null && !headerMatchesRecipient(opened.header, opened.expected);
}

/** Scrolls a thread up to load older messages. */
async function loadOlderMessages(nav: Nav, scope: Locator, limit: number): Promise<{ rounds: number; exhausted: boolean }> {
  const items = scope.locator(EXTRACT.message.container.join(", "));
  let n = await items.count();
  let rounds = 0;
  while (n < limit && rounds < 3) {
    rounds++;
    await items
      .first()
      .hover({ timeout: 2000 })
      .catch(() => undefined);
    for (let i = 0; i < 4; i++) {
      await nav.page.mouse.wheel(0, -500);
      await nav.pacer.beat(80, 200);
    }
    await nav.pacer.beat(1200, 2200);
    const next = await items.count();
    if (next <= n) return { rounds, exhausted: true };
    n = next;
  }
  return { rounds, exhausted: n >= limit };
}

export async function readConversationResult(nav: Nav, target: string, limit: number): Promise<ListResult<Message>> {
  const opened = await openThread(nav, target, false);
  if (recipientMismatch(opened)) {
    throw new LinkedInMcpError("SELECTOR_BROKEN", "The conversation that opened doesn't name the person on the profile.", "Try again with a thread URL from get_inbox.", { target });
  }
  const found = await waitForAny(nav.page, EXTRACT.message.container, 8000);
  if (!found) {
    if (threadUrl(target)) await ensureListLoaded(nav.page, false, "conversation messages");
    // A new conversation has no messages; timestamps without recognised messages mean the layout changed.
    else if (await opened.thread.locator("time").count()) throw selectorBroken("conversation messages", { url: nav.page.url() });
    return { items: [], complete: true };
  }
  const progress = await loadOlderMessages(nav, opened.thread, limit);
  const snaps = await extractSnapshots(nav.page, EXTRACT.message);
  return finishList(parseMessages(snaps, limit), limit, { ...progress, maxRounds: 3 }, "messages");
}

export async function readConversation(nav: Nav, target: string, limit: number): Promise<Message[]> {
  return (await readConversationResult(nav, target, limit)).items;
}

/**
 * Sends a message. Checks that the conversation that opened names the
 * profile's person before typing, sends with the Send button (or Enter when
 * LinkedIn's "Press Enter to Send" setting hides it), and returns `sent` only
 * when a new message of yours with this text appeared in that conversation.
 */
export async function sendMessage(nav: Nav, target: string, text: string): Promise<WriteResult> {
  const viaThread = Boolean(threadUrl(target));
  const opened = await openThread(nav, target, true);

  return runWrite(nav, async (attempt) => {
    if (recipientMismatch(opened)) {
      const close = await findOptional(opened.thread, SEL.messaging.closeOverlay, { timeout: 1000 });
      if (close) await close.click().catch(() => undefined);
      return notSent("recipient_mismatch", `the conversation that opened is headed "${opened.header.lines[0] ?? "?"}", not ${opened.expected?.name ?? "the person on the profile"}, so nothing was typed`, {
        next_step: "Try again with a thread URL from get_inbox, or check the profile URL.",
      });
    }
    const { thread, editor } = opened;
    const before = await readBubbles(thread, EXTRACT.message.container).catch(() => []);

    await editor.click();
    await nav.pacer.beat();
    // Enter may send in LinkedIn messaging, so new lines use Shift+Enter.
    await nav.pacer.typeText(nav.page, text, { newline: "shift-enter" });
    await nav.pacer.beat(700, 1500);
    if (!editorHolds(await editor.innerText().catch(() => ""), text)) {
      throw new LinkedInMcpError("INTERNAL", "The text didn't land in the message box as written, so nothing was sent.", "Try again. If it keeps happening, report it as a broken selector.");
    }

    const send = (await findOptional(editor.locator(FORM_FROM_EDITOR), SEL.messaging.send, { timeout: 1500 })) ?? (await findOptional(thread, SEL.messaging.send, { timeout: 1500 }));
    if (send) {
      if (!(await send.isEnabled().catch(() => false))) throw selectorBroken("messaging.send", { reason: "the Send button is disabled" });
      attempt.commit("send button");
      await send.click();
    } else {
      // "Press Enter to Send" is on: there is no Send button.
      await editor.focus();
      attempt.commit("enter to send");
      await nav.page.keyboard.press("Enter");
    }

    const delivered = await pollUntil(async () => newOwnBubble(before, await readBubbles(thread, EXTRACT.message.container), text), 8000);
    if (!delivered) {
      const stillTyped = editorHolds(await editor.innerText().catch(() => ""), text);
      return unconfirmed(
        "message_not_shown",
        stillTyped ? "no new message with this text appeared, and the text is still in the message box, so it was most likely not sent" : "no new message with this text appeared in the conversation",
        { via: viaThread ? "thread" : "profile" },
      );
    }
    if (!viaThread) {
      const close = await findOptional(thread, SEL.messaging.closeOverlay, { timeout: 1500 });
      if (close) await close.click().catch(() => undefined);
    }
    return sent({ via: viaThread ? "thread" : "profile" });
  });
}
