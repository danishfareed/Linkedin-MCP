import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError } from "../../errors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { PROFILE_METRICS, type Metric, readMetrics } from "../parse/analytics.js";
import {
  type ConversationSummary,
  type Invitation,
  type Message,
  type Notification,
  parseConversation,
  parseInvitation,
  parseMessages,
  parseNotification,
} from "../parse/inbox.js";
import { type CompanyResult, type PersonResult, parseCompanyResult, parsePersonResult, parseResults } from "../parse/search.js";
import { EXTRACT, type ExtractSpec, SEL } from "../selectors.js";
import type { Snapshot } from "../snapshot.js";
import { type PeopleFilters, profileId, profileUrl, searchCompaniesUrl, searchPeopleUrl, threadUrl, urls } from "../urls.js";

async function collect<T>(nav: Nav, spec: ExtractSpec, parse: (s: Snapshot[]) => T[], limit: number, maxScrolls = 4): Promise<T[]> {
  await waitForAny(nav.page, spec.container, 12_000);
  let out: T[] = [];
  for (let i = 0; i <= maxScrolls; i++) {
    out = parse(await extractSnapshots(nav.page, spec));
    if (out.length >= limit || i === maxScrolls) break;
    await nav.pacer.scroll(nav.page, 1);
  }
  return out.slice(0, limit);
}

function keep<T>(items: (T | null)[]): T[] {
  return items.filter((x): x is T => x !== null);
}

// --- Search -----------------------------------------------------------------

export async function searchPeople(nav: Nav, keywords: string, filters: PeopleFilters, limit: number): Promise<PersonResult[]> {
  await nav.goto(searchPeopleUrl(keywords, filters), { waitFor: EXTRACT.personResult.container });
  return collect(nav, EXTRACT.personResult, (s) => parseResults(s, parsePersonResult, limit), limit, 1);
}

export async function searchCompanies(nav: Nav, keywords: string, limit: number): Promise<CompanyResult[]> {
  await nav.goto(searchCompaniesUrl(keywords), { waitFor: EXTRACT.companyResult.container });
  return collect(nav, EXTRACT.companyResult, (s) => parseResults(s, parseCompanyResult, limit), limit, 1);
}

// --- Notifications ----------------------------------------------------------

export async function readNotifications(nav: Nav, limit: number): Promise<Notification[]> {
  await nav.goto(urls.notifications(), { waitFor: EXTRACT.notification.container });
  return collect(nav, EXTRACT.notification, (s) => keep(s.map(parseNotification)), limit);
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

export async function listInvitations(nav: Nav, direction: "received" | "sent", limit: number): Promise<Invitation[]> {
  await nav.goto(direction === "received" ? urls.invitationsReceived() : urls.invitationsSent(), { waitFor: EXTRACT.invitation.container });
  return collect(nav, EXTRACT.invitation, (s) => keep(s.map(parseInvitation)), limit);
}

export async function respondToInvitation(nav: Nav, id: string, action: "accept" | "ignore"): Promise<{ status: "accepted" | "ignored" }> {
  const publicId = profileId(id);
  await nav.goto(urls.invitationsReceived(), { waitFor: EXTRACT.invitation.container });
  const card = nav.page
    .locator(EXTRACT.invitation.container.join(", "))
    .filter({ has: nav.page.locator(`a[href*="/in/${publicId}"]`) })
    .first();
  if (!(await card.count())) {
    throw new LinkedInMcpError("INVALID_INPUT", "No pending invitation from that person was found.", "Call list_invitations to get current invitation ids.", { id: publicId });
  }
  const button = await find(card, action === "accept" ? SEL.invitations.accept : SEL.invitations.ignore, { timeout: 6000 });
  await button.click();
  await nav.pacer.beat(1000, 2000);
  return { status: action === "accept" ? "accepted" : "ignored" };
}

// --- Messaging --------------------------------------------------------------

export async function readInbox(nav: Nav, limit: number): Promise<ConversationSummary[]> {
  await nav.goto(urls.messaging(), { waitFor: EXTRACT.conversation.container });
  return collect(nav, EXTRACT.conversation, (s) => keep(s.map(parseConversation)), limit, 2);
}

/** Opens a thread by URL, or a profile's message window. */
async function openConversation(nav: Nav, target: string): Promise<void> {
  const thread = threadUrl(target);
  if (thread) {
    await nav.goto(thread, { waitFor: EXTRACT.message.container });
    return;
  }
  await nav.goto(profileUrl(target), { waitFor: ["main h1"] });
  const message = await findOptional(nav.page, SEL.profile.message, { timeout: 6000 });
  if (!message) {
    throw new LinkedInMcpError("INVALID_INPUT", "You can't message this person from their profile (usually because you're not connected).", "Send a connection request first, or use a thread URL from get_inbox.", { target });
  }
  await message.click();
  await nav.pacer.beat(1500, 2500);
  await find(nav.page, SEL.messaging.editor, { timeout: 10_000 });
}

export async function readConversation(nav: Nav, target: string, limit: number): Promise<Message[]> {
  await openConversation(nav, target);
  await waitForAny(nav.page, EXTRACT.message.container, 8000);
  return parseMessages(await extractSnapshots(nav.page, EXTRACT.message), limit);
}

export async function sendMessage(nav: Nav, target: string, text: string): Promise<{ status: "sent"; verified: boolean }> {
  await openConversation(nav, target);
  const editor = await find(nav.page, SEL.messaging.editor, { timeout: 10_000 });
  await editor.click();
  await nav.pacer.beat();
  // Enter may send in LinkedIn messaging, so new lines use Shift+Enter.
  await nav.pacer.typeText(nav.page, text, { newline: "shift-enter" });
  await nav.pacer.beat(700, 1500);
  const send = await find(nav.page, SEL.messaging.send, { timeout: 6000 });
  await send.click();
  await nav.pacer.beat(1500, 2500);
  const probe = text.split("\n")[0]!.slice(0, 50);
  const verified = await nav.page
    .locator(EXTRACT.message.container.join(", "))
    .filter({ hasText: probe })
    .last()
    .isVisible()
    .catch(() => false);
  if (!threadUrl(target)) {
    const close = await findOptional(nav.page, SEL.messaging.closeOverlay, { timeout: 1500 });
    if (close) await close.click().catch(() => undefined);
  }
  return { status: "sent", verified };
}
