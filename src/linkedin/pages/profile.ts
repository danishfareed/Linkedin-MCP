import type { Locator } from "patchright";
import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError, invalidInput, selectorBroken, toMcpError } from "../../errors.js";
import { PROFILE_MENU, PROFILE_READY } from "../anchors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { assertEnglish } from "../language.js";
import { ensureListLoaded } from "../loaded.js";
import { type WriteAttempt, type WriteResult, notSent, pollUntil, runWrite, sent, unconfirmed } from "../outcome.js";
import { type Company, parseCompany } from "../parse/company.js";
import { type TopCardState, classifyInviteDialog, menuItemForTarget, noConnectReason, planConnect, profileIdFromUrl, topCardState } from "../parse/invite.js";
import { type DetailsSection, type Profile, type ProfileEntry, type ProfileSection, missingSections, parseDetailsEntries, parseProfile, planDetails, profileCompleteness } from "../parse/profile.js";
import { editorHolds } from "../parse/verify.js";
import { clickLoadMore, closeDialog, closeMessageOverlays, dialogActions, dismissStrayDialogs, readInviteDialog, readTopCard, topCard, waitForDialog, waitForNoDialog } from "../scope.js";
import { EXTRACT, SEL, type SelectorEntry } from "../selectors.js";
import { companyAboutUrl, profileId, profileUrl, urls } from "../urls.js";

// --- Reading profiles -------------------------------------------------------

/** Lower sections render as you scroll: scroll until every requested one is there, or nothing new appears. */
async function loadSections(nav: Nav, wanted: readonly ProfileSection[]): Promise<void> {
  let last = -1;
  let stalls = 0;
  for (let i = 0; i < 8; i++) {
    const snaps = await extractSnapshots(nav.page, EXTRACT.profileSection);
    if (!missingSections(snaps, wanted).length) return;
    if (snaps.length <= last) {
      if (++stalls >= 2) return;
    } else {
      stalls = 0;
    }
    last = snaps.length;
    await nav.pacer.scroll(nav.page, 2);
  }
}

const DETAILS_ITEMS = ["main section li", "main ul > li"];

/** Reads a /details/<section>/ page in full. `complete` is false when we stopped while more was still loading. */
async function readDetailsPage(nav: Nav, url: string, key: DetailsSection): Promise<{ entries: ProfileEntry[]; complete: boolean }> {
  await nav.goto(url, { waitFor: DETAILS_ITEMS });
  const found = await waitForAny(nav.page, DETAILS_ITEMS, 10_000);
  await ensureListLoaded(nav.page, found, `profile ${key}`);
  if (!found) return { entries: [], complete: false };
  let complete = false;
  let last = await nav.page.locator(DETAILS_ITEMS[0]!).count();
  for (let i = 0; i < 6; i++) {
    const clicked = await clickLoadMore(nav, nav.page.locator("main"));
    if (!clicked) await nav.pacer.scroll(nav.page, 2);
    const now = await nav.page.locator(DETAILS_ITEMS[0]!).count();
    if (!clicked && now <= last) {
      complete = true;
      break;
    }
    last = now;
  }
  return { entries: parseDetailsEntries(await extractSnapshots(nav.page, EXTRACT.profileSection), key), complete };
}

/** Problems on a details page fall back to the main page's entries; safety stops still stop. */
const DETAILS_FALLBACK_CODES = new Set(["SELECTOR_BROKEN", "TIMEOUT", "INTERNAL", "NOT_FOUND"]);

async function readProfilePage(nav: Nav, sections: readonly ProfileSection[], url: string): Promise<Profile> {
  const found = await waitForAny(nav.page, PROFILE_READY, 15_000);
  await ensureListLoaded(nav.page, found, "profile");
  if (sections.some((s) => s !== "about")) await loadSections(nav, sections);
  const [top] = await extractSnapshots(nav.page, EXTRACT.profileTop);
  if (!top) throw new LinkedInMcpError("INVALID_INPUT", "That profile could not be loaded.", "Check the profile URL or username.", { url });
  const sectionSnaps = await extractSnapshots(nav.page, EXTRACT.profileSection);
  const profile = parseProfile(top, sectionSnaps, sections, url);

  // Long Experience/Education lists are cut off on the main page behind "Show all".
  const plan = planDetails(sectionSnaps, sections);
  const truncated: ProfileSection[] = [...plan.truncated];
  for (const { key, url: detailsUrl } of plan.fetch) {
    try {
      const { entries, complete } = await readDetailsPage(nav, detailsUrl, key);
      if (entries.length) profile[key] = entries;
      if (!entries.length || !complete) truncated.push(key);
    } catch (err) {
      const e = toMcpError(err);
      if (!DETAILS_FALLBACK_CODES.has(e.code)) throw e;
      truncated.push(key);
    }
  }
  return { ...profile, ...profileCompleteness(truncated) };
}

export async function readPersonProfile(nav: Nav, input: string, sections: readonly ProfileSection[]): Promise<Profile> {
  const url = profileUrl(input);
  await nav.goto(url, { waitFor: PROFILE_READY });
  if (/\/404|unavailable/i.test(nav.page.url())) {
    throw new LinkedInMcpError("INVALID_INPUT", "That profile does not exist or is not visible to you.", "Check the URL or username.", { url });
  }
  return readProfilePage(nav, sections, url);
}

/** Your own profile. Also returns your public identifier from the /in/me/ redirect. */
export async function readMyProfile(nav: Nav, sections: readonly ProfileSection[]): Promise<Profile & { public_id: string | null }> {
  await nav.goto(urls.me(), { waitFor: PROFILE_READY });
  const id = profileIdFromUrl(nav.page.url());
  const url = id ? `https://www.linkedin.com/in/${encodeURIComponent(id)}/` : nav.page.url();
  const profile = await readProfilePage(nav, sections, url);
  return { ...profile, public_id: id };
}

export async function readCompany(nav: Nav, input: string): Promise<Company> {
  const url = companyAboutUrl(input);
  await nav.goto(url, { waitFor: ["main h1"] });
  const [snap] = await extractSnapshots(nav.page, EXTRACT.companyAbout);
  if (!snap) throw new LinkedInMcpError("INVALID_INPUT", "That company page could not be loaded.", "Check the company URL or slug.", { url });
  return parseCompany(snap, url.replace(/about\/$/, ""));
}

// --- Connection requests ----------------------------------------------------

async function readState(nav: Nav, ids: (string | null)[], timeout = 6000): Promise<TopCardState> {
  const card = await topCard(nav.page, timeout);
  return topCardState(await readTopCard(card), { ids, pageUrl: nav.page.url() });
}

/** The top card shows Pending (polls, never throws). */
async function pendingShown(nav: Nav, ids: (string | null)[], timeoutMs: number): Promise<boolean> {
  return pollUntil(async () => (await readState(nav, ids, 2000)).pending, timeoutMs);
}

/**
 * Verifies an invitation by re-reading the profile for Pending. LinkedIn is
 * sometimes slow to show it, so it checks once more after about 3 seconds,
 * on a freshly loaded profile.
 */
async function verifyInvite(nav: Nav, url: string, ids: (string | null)[], data: Record<string, unknown>): Promise<WriteResult> {
  if (!(await waitForNoDialog(nav.page, 5000))) {
    const leftover = await dialogText(nav);
    if (leftover) data = { ...data, dialog_text: leftover };
  }
  if (await pendingShown(nav, ids, 3000)) return sent(data);
  await nav.pacer.beat(2800, 3400);
  await nav.goto(url, { waitFor: PROFILE_READY });
  if (await pendingShown(nav, ids, 4000)) return sent(data);
  return unconfirmed("pending_not_shown", "LinkedIn didn't show the invitation as Pending on the profile afterwards", data);
}

async function dialogText(nav: Nav): Promise<string | null> {
  const d = await waitForDialog(nav.page, 200);
  if (!d) return null;
  const t = (await d.innerText().catch(() => "")).replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 300) : null;
}

type MenuConnect = { kind: "item"; item: Locator } | { kind: "wrong_person"; found: string } | { kind: "none" };

/** Opens the top card's More menu and finds Connect in it (matched exactly, never "Remove connection"). */
async function connectFromMoreMenu(nav: Nav, card: Locator, state: TopCardState, ids: (string | null)[]): Promise<MenuConnect> {
  const more = await findOptional(card, SEL.profile.moreActions, { timeout: 4000 });
  if (!more) return { kind: "none" };
  await more.click();
  await nav.pacer.beat();
  // The dropdown renders inside the top card or in a popup layer.
  const menu = (await findOptional(card, PROFILE_MENU, { timeout: 2000 })) ?? (await findOptional(nav.page, PROFILE_MENU, { timeout: 2000 }));
  const item = menu ? await findOptional(menu, SEL.profile.connectInMenu, { timeout: 2500 }) : await findOptional(card, SEL.profile.connectInMenu, { timeout: 1500 });
  if (!item) {
    await nav.page.keyboard.press("Escape").catch(() => undefined);
    return { kind: "none" };
  }
  const href = await item.getAttribute("href").catch(() => null);
  const label = ((await item.getAttribute("aria-label").catch(() => null)) ?? (await item.innerText().catch(() => ""))).trim();
  if (!menuItemForTarget({ href, label }, state.name, ids)) {
    await nav.page.keyboard.press("Escape").catch(() => undefined);
    return { kind: "wrong_person", found: href ?? label };
  }
  return { kind: "item", item };
}

function emailRequired(): WriteResult {
  return notSent("email_required", "LinkedIn asks for this person's email address before it will send the invitation", {
    next_step: "linkedin-mcp won't guess an email address. If you know it, send the invitation yourself on LinkedIn.",
  });
}

/** The dialog's primary button: by name first, else the last labelled button in the dialog. */
async function primaryButton(dialog: Locator, named: SelectorEntry): Promise<Locator | null> {
  const byName = await findOptional(dialog, named, { timeout: 2000 });
  if (byName) return byName;
  const actions = dialogActions(dialog);
  return (await actions.count().catch(() => 0)) > 0 ? actions.last() : null;
}

async function clickToSend(attempt: WriteAttempt, button: Locator, step: string): Promise<void> {
  if (!(await button.isEnabled().catch(() => false))) throw selectorBroken("connect.send", { reason: "the Send button is disabled" });
  attempt.commit(step);
  await button.click();
}

/** After Connect was clicked: handles the invite dialog and sends. */
async function completeInvite(nav: Nav, attempt: WriteAttempt, url: string, ids: (string | null)[], note: string | undefined): Promise<WriteResult> {
  let dialog = await waitForDialog(nav.page, 6000);
  if (!dialog) {
    // Some layouts send straight from the Connect click. That click may have
    // been the commit point, so from here on failures are "unconfirmed".
    attempt.commit("connect (LinkedIn showed no invite dialog)");
    return verifyInvite(nav, url, ids, { note_included: false, ...(note ? { warning: "LinkedIn sent the invitation without offering a note." } : {}) });
  }

  let snap = await readInviteDialog(dialog);
  let step = classifyInviteDialog(snap, "after_connect");

  if (step === "add_note_prompt" && note) {
    const add = (await findOptional(dialog, SEL.connect.addNote, { timeout: 2000 })) ?? (snap.actions.length === 2 ? dialogActions(dialog).first() : null);
    if (!add) throw selectorBroken("connect.addNote");
    await add.click();
    await nav.pacer.beat(700, 1300);
    dialog = await waitForDialog(nav.page, 5000);
    if (!dialog) throw selectorBroken("connect.noteDialog");
    snap = await readInviteDialog(dialog);
    step = classifyInviteDialog(snap, "after_add_note");
    if (step === "premium_note_limit") {
      await closeDialog(nav, dialog);
      return notSent("premium_note_limit", "LinkedIn wants Premium before adding a note: this account has used its free personalised invitations for now", {
        next_step: "Ask the user whether to send the request without a note (call send_connection_request again without one), or try the note again later.",
      });
    }
  }

  switch (step) {
    case "email_required":
      await closeDialog(nav, dialog);
      return emailRequired();

    case "add_note_prompt": {
      // No note wanted: "Send without a note" (the primary, last button).
      const send = (await findOptional(dialog, SEL.connect.sendWithoutNote, { timeout: 2000 })) ?? (snap.actions.length === 2 ? dialogActions(dialog).last() : null);
      if (!send) throw selectorBroken("connect.sendWithoutNote");
      await clickToSend(attempt, send, "send without a note");
      return verifyInvite(nav, url, ids, { note_included: false });
    }

    case "note_form": {
      if (note) {
        const box = await find(dialog, SEL.connect.note, { timeout: 4000 });
        const max = snap.noteMax ?? Number((await box.getAttribute("maxlength")) ?? "300");
        if (Number.isFinite(max) && max > 0 && [...note].length > max) {
          await closeDialog(nav, dialog);
          throw new LinkedInMcpError("INVALID_INPUT", `Your note is ${[...note].length} characters, but LinkedIn allows ${max} on this account.`, `Shorten the note to ${max} characters or fewer.`, { max });
        }
        await box.click();
        await nav.pacer.typeText(nav.page, note);
        await nav.pacer.beat();
        if (!editorHolds(await box.inputValue().catch(() => ""), note)) {
          await closeDialog(nav, dialog);
          throw new LinkedInMcpError("INTERNAL", "The note didn't land in LinkedIn's note box as written, so nothing was sent.", "Try again. If it keeps happening, report it as a broken selector.");
        }
      }
      const send = await primaryButton(dialog, SEL.connect.send);
      if (!send) throw selectorBroken("connect.send");
      await clickToSend(attempt, send, note ? "send with a note" : "send");
      return verifyInvite(nav, url, ids, { note_included: Boolean(note) });
    }

    default: {
      const text = (await dialog.innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
      await closeDialog(nav, dialog);
      throw selectorBroken("connect.dialog", { reason: "LinkedIn showed a dialog linkedin-mcp doesn't recognise", ...(text ? { dialog_text: text } : {}) });
    }
  }
}

/**
 * Sends a connection request. Everything is scoped to the profile's top card
 * and then to the dialog that opened after the Connect click. Returns `sent`
 * only once the profile shows Pending.
 */
export async function sendConnectionRequest(nav: Nav, input: string, note: string | undefined): Promise<WriteResult> {
  const url = profileUrl(input);
  const requested = profileId(input);
  await nav.goto(url, { waitFor: PROFILE_READY });
  await assertEnglish(nav.page);

  return runWrite(nav, async (attempt) => {
    await closeMessageOverlays(nav);
    await dismissStrayDialogs(nav);
    const ids = [requested, profileIdFromUrl(nav.page.url())];
    const card = await topCard(nav.page);
    const state = topCardState(await readTopCard(card), { ids, pageUrl: nav.page.url() });
    const plan = planConnect(state);

    if (plan.kind === "self") throw invalidInput("That's your own profile, so there's no one to send a connection request to.");
    if (plan.kind === "pending") {
      return notSent("already_pending", "you already have a pending invitation to this person", {
        next_step: "Nothing to do: wait for them to accept. To send a new one, withdraw the old invitation on LinkedIn first.",
      });
    }
    if (plan.kind === "wrong_person") {
      return notSent("recipient_mismatch", `the Connect button on this page is for someone else (${plan.found ?? "unknown"}), so it wasn't clicked`, {
        next_step: "Check the profile URL. If it's right, report this as a broken selector.",
      });
    }

    let connect: Locator | null = null;
    if (plan.kind === "click_top_card") {
      connect = await find(card, SEL.profile.connect, { timeout: 4000 });
    } else {
      const fromMenu = await connectFromMoreMenu(nav, card, state, ids);
      if (fromMenu.kind === "wrong_person") {
        return notSent("recipient_mismatch", `the Connect item in the menu is for someone else (${fromMenu.found}), so it wasn't clicked`, {
          next_step: "Check the profile URL. If it's right, report this as a broken selector.",
        });
      }
      if (fromMenu.kind === "item") connect = fromMenu.item;
    }

    if (!connect) {
      if (noConnectReason(state) === "already_connected") {
        return notSent("already_connected", "there's no Connect option on this profile, only Message, so you're most likely already connected", {
          next_step: "Nothing to do. Use send_message to write to them.",
        });
      }
      throw new LinkedInMcpError("INVALID_INPUT", "This profile has no Connect option for you (it may be Follow-only, or invitations may be limited).", "Try messaging or following them on LinkedIn instead.", { url });
    }

    await connect.click();
    await nav.pacer.beat(800, 1500);
    return completeInvite(nav, attempt, url, ids, note);
  });
}
