import type { Locator, Page } from "patchright";
import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError } from "../../errors.js";
import { PROFILE_READY, TOAST } from "../anchors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { assertEnglish } from "../language.js";
import { type WriteResult, runWrite, sent, unconfirmed } from "../outcome.js";
import { profileIdFromUrl } from "../parse/invite.js";
import { cleanBody, lines } from "../parse/text.js";
import { containsText } from "../parse/verify.js";
import { EXTRACT, SEL } from "../selectors.js";
import { cleanLink, postUrl, urls } from "../urls.js";

export interface PostContent {
  text: string;
  images?: string[];
  document?: { path: string; title: string };
  visibility: "anyone" | "connections";
}

/** `write`: gate on LinkedIn's display language before the first click (reads aren't gated). */
async function openComposer(nav: Nav, opts: { write?: boolean } = {}): Promise<Locator> {
  await nav.goto(urls.feed());
  if (opts.write) await assertEnglish(nav.page);
  const start = await find(nav.page, SEL.composer.startPost, { timeout: 15_000 });
  await start.click();
  await nav.pacer.beat(1000, 2000);
  return find(nav.page, SEL.composer.editor, { timeout: 10_000 });
}

async function chooseFiles(nav: Nav, trigger: Locator, files: string[]): Promise<void> {
  const chooser = nav.page.waitForEvent("filechooser", { timeout: 10_000 });
  await trigger.click();
  const fc = await chooser;
  await fc.setFiles(files);
  await nav.pacer.beat(2000, 4000);
}

async function attachImages(nav: Nav, images: string[]): Promise<void> {
  const addMedia = await find(nav.page, SEL.composer.addMedia, { timeout: 8000 });
  // Some layouts open an upload screen first, others open the file picker directly.
  const chooser = nav.page.waitForEvent("filechooser", { timeout: 6000 }).catch(() => null);
  await addMedia.click();
  let fc = await chooser;
  if (!fc) {
    const choose = await find(nav.page, SEL.composer.chooseFile, { timeout: 6000 });
    const second = nav.page.waitForEvent("filechooser", { timeout: 8000 });
    await choose.click();
    fc = await second;
  }
  await fc.setFiles(images);
  await nav.pacer.beat(2500, 5000);
  const done = await find(nav.page, SEL.composer.mediaDone, { timeout: 30_000 });
  await done.click();
  await nav.pacer.beat(1000, 2000);
}

async function attachDocument(nav: Nav, doc: { path: string; title: string }): Promise<void> {
  let addDoc = await findOptional(nav.page, SEL.composer.addDocument, { timeout: 2000 });
  if (!addDoc) {
    const more = await find(nav.page, SEL.composer.moreOptions, { timeout: 6000 });
    await more.click();
    await nav.pacer.beat();
    addDoc = await find(nav.page, SEL.composer.addDocument, { timeout: 6000 });
  }
  await addDoc.click();
  await nav.pacer.beat();
  const choose = await find(nav.page, SEL.composer.chooseFile, { timeout: 8000 });
  await chooseFiles(nav, choose, [doc.path]);
  const title = await find(nav.page, SEL.composer.documentTitle, { timeout: 60_000 });
  await title.click();
  await nav.pacer.typeText(nav.page, doc.title);
  await nav.pacer.beat();
  const done = await find(nav.page, SEL.composer.mediaDone, { timeout: 30_000 });
  await done.click();
  await nav.pacer.beat(1000, 2000);
}

async function setVisibility(nav: Nav, visibility: PostContent["visibility"]): Promise<void> {
  const button = await find(nav.page, SEL.composer.visibilityButton, { timeout: 8000 });
  const current = `${(await button.getAttribute("aria-label")) ?? ""} ${(await button.innerText().catch(() => "")) ?? ""}`;
  const already = visibility === "anyone" ? /\banyone\b/i.test(current) : /connections only/i.test(current);
  if (already) return;
  await button.click();
  await nav.pacer.beat();
  const option = await find(nav.page, visibility === "anyone" ? SEL.composer.visibilityAnyone : SEL.composer.visibilityConnections, { timeout: 6000 });
  await option.click();
  await nav.pacer.beat(300, 700);
  const done = await find(nav.page, SEL.composer.visibilityDone, { timeout: 6000 });
  await done.click();
  await nav.pacer.beat();
}

/** Opens the composer and fills it. Nothing is published. */
async function compose(nav: Nav, content: PostContent): Promise<void> {
  await openComposer(nav, { write: true });
  await setVisibility(nav, content.visibility);
  // The settings screen replaces the editor, so look it up again afterwards.
  const editor = await find(nav.page, SEL.composer.editor, { timeout: 8000 });
  await editor.click();
  await nav.pacer.typeText(nav.page, content.text);
  await nav.pacer.beat(800, 1600);
  if (content.images?.length) await attachImages(nav, content.images);
  if (content.document) await attachDocument(nav, content.document);
}

async function waitForComposerClosed(page: Page, timeout = 30_000): Promise<boolean> {
  const editor = SEL.composer.editor.candidates
    .filter((c): c is { css: string } => "css" in c)
    .map((c) => c.css)
    .join(", ");
  try {
    await page.waitForSelector(editor, { state: "detached", timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * After publishing, LinkedIn shows a success toast with a link to the new
 * post. Looked up inside the toast (the feed itself is full of post links),
 * with the old "View post" text match kept as a fallback.
 */
async function newPostUrl(page: Page): Promise<string | null> {
  const inToast = page.locator(TOAST).locator("a[href*='/feed/update/urn:li:']").first();
  const byText = page.locator("a[href*='/feed/update/urn:li:']").filter({ hasText: /view post/i }).first();
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    for (const link of [inToast, byText]) {
      if (await link.isVisible().catch(() => false)) return cleanLink(await link.getAttribute("href").catch(() => null));
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

/** Your newest posts on your recent activity, checked for this text (once more after about 3 s). */
async function findOnRecentActivity(nav: Nav, text: string): Promise<{ url: string | null } | null> {
  await nav.goto(urls.me(), { waitFor: PROFILE_READY });
  const id = profileIdFromUrl(nav.page.url());
  if (!id) return null;
  const activity = urls.myActivity(id).replace("/all/", "/shares/");
  for (let i = 0; i < 2; i++) {
    if (i) await nav.pacer.beat(2800, 3400);
    await nav.goto(activity, { waitFor: EXTRACT.feedPost.container });
    if (!(await waitForAny(nav.page, EXTRACT.feedPost.container, 8000))) continue;
    const hit = (await extractSnapshots(nav.page, EXTRACT.feedPost)).slice(0, 5).find((s) => containsText(s.text, text));
    if (hit) {
      let url: string | null = null;
      try {
        url = hit.urn ? postUrl(hit.urn) : null;
      } catch {
        url = null;
      }
      return { url };
    }
  }
  return null;
}

/** The composer's own Post button, inside the composer dialog when it can be found. */
async function composerScope(nav: Nav): Promise<Page | Locator> {
  return (await findOptional(nav.page, SEL.composer.dialog, { timeout: 3000 })) ?? nav.page;
}

/**
 * Publishes a post. `sent` once the composer closed and either LinkedIn's
 * success toast appeared or the post shows on your recent activity.
 */
export async function publishPost(nav: Nav, content: PostContent): Promise<WriteResult> {
  return runWrite(nav, async (attempt) => {
    await compose(nav, content);
    const post = await find(await composerScope(nav), SEL.composer.postButton, { timeout: 10_000 });
    if (!(await post.isEnabled())) {
      throw new LinkedInMcpError("INVALID_INPUT", "LinkedIn did not enable the Post button. The content may be empty or still uploading.", "Try again with valid content.");
    }
    attempt.commit("post");
    await post.click();
    if (!(await waitForComposerClosed(nav.page))) return unconfirmed("composer_still_open", "the post editor didn't close after clicking Post");
    const url = await newPostUrl(nav.page);
    if (url) return sent({ url });
    const onActivity = await findOnRecentActivity(nav, content.text);
    if (onActivity) return sent({ url: onActivity.url });
    return unconfirmed("not_on_activity", "the editor closed, but no success message appeared and the post isn't on your recent activity yet");
  });
}

function formatDate(date: Date, placeholder: string): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const p = placeholder.toLowerCase();
  if (/^y/.test(p)) return `${yyyy}-${mm}-${dd}`;
  if (/^d/.test(p)) return `${dd}/${mm}/${yyyy}`;
  return `${mm}/${dd}/${yyyy}`;
}

function formatTime(date: Date, twelveHour: boolean): string {
  const h = date.getHours();
  const m = String(date.getMinutes()).padStart(2, "0");
  if (!twelveHour) return `${String(h).padStart(2, "0")}:${m}`;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${suffix}`;
}

async function replaceValue(nav: Nav, input: Locator, value: string): Promise<void> {
  await input.click();
  await nav.page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
  await nav.page.keyboard.press("Backspace");
  await nav.pacer.typeText(nav.page, value);
  await nav.page.keyboard.press("Tab");
  await nav.pacer.beat(400, 900);
}

/**
 * Schedules a post with LinkedIn's own scheduler. `sent` once the composer
 * closed and the post appears in LinkedIn's scheduled-posts list.
 */
export async function schedulePost(nav: Nav, content: PostContent, publishAt: Date): Promise<WriteResult> {
  const publish_at = publishAt.toISOString();
  return runWrite(nav, async (attempt) => {
    await compose(nav, content);
    const clock = await find(nav.page, SEL.composer.scheduleButton, { timeout: 8000 });
    await clock.click();
    await nav.pacer.beat(800, 1500);

    const date = await find(nav.page, SEL.schedule.dateInput, { timeout: 8000 });
    const placeholder = (await date.getAttribute("placeholder")) ?? (await date.inputValue().catch(() => "")) ?? "";
    await replaceValue(nav, date, formatDate(publishAt, placeholder));

    const time = await find(nav.page, SEL.schedule.timeInput, { timeout: 8000 });
    const currentTime = `${(await time.inputValue().catch(() => "")) ?? ""} ${(await time.getAttribute("placeholder")) ?? ""}`;
    const twelveHour = /am|pm/i.test(currentTime) || (!/\d{2}:\d{2}$/.test(currentTime.trim()) && /en-US/i.test(Intl.DateTimeFormat().resolvedOptions().locale));
    await replaceValue(nav, time, formatTime(publishAt, twelveHour));

    const next = await find(nav.page, SEL.schedule.next, { timeout: 8000 });
    if (!(await next.isEnabled())) {
      throw new LinkedInMcpError("INVALID_INPUT", "LinkedIn rejected the scheduled date or time.", "Pick a time at least an hour ahead and no more than three months out, in 15-minute steps.", { publish_at });
    }
    await next.click();
    await nav.pacer.beat(800, 1500);
    const confirm = await find(await composerScope(nav), SEL.schedule.confirm, { timeout: 10_000 });
    attempt.commit("schedule");
    await confirm.click();
    if (!(await waitForComposerClosed(nav.page))) return unconfirmed("composer_still_open", "the post editor didn't close after clicking Schedule", { publish_at });

    await nav.pacer.beat(1500, 2500);
    const listed = (await readScheduledList(nav)).find((p) => containsText(p.text, content.text, 40));
    if (listed) return sent({ publish_at, scheduled_for: listed.scheduled_for });
    return unconfirmed("not_in_scheduled_list", "the editor closed, but the post isn't in LinkedIn's scheduled-posts list", { publish_at });
  });
}

export interface ScheduledPost {
  scheduled_for: string | null;
  text: string | null;
}

/** Pure: one row of the scheduled-posts list. */
export function parseScheduledRow(text: string): ScheduledPost {
  const ls = lines(text);
  const whenIdx = ls.findIndex((l) => /\b(scheduled|am|pm|\d{1,2}:\d{2})\b/i.test(l));
  const when = whenIdx >= 0 ? ls[whenIdx]! : null;
  const body = ls.filter((_, i) => i !== whenIdx && !/^(edit|delete|reschedule|more)$/i.test(ls[i]!));
  return { scheduled_for: when, text: cleanBody(body.join("\n")) };
}

async function closeComposer(nav: Nav): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const dismiss = await findOptional(nav.page, SEL.composer.dismiss, { timeout: 1500 });
    if (!dismiss) break;
    await dismiss.click();
    await nav.pacer.beat(400, 900);
    const discard = await findOptional(nav.page, SEL.composer.discardConfirm, { timeout: 1500 });
    if (discard) await discard.click();
  }
}

/** For `doctor`: opens the composer, checks the editor and scheduler button exist, closes it. Types nothing. */
export async function checkComposer(nav: Nav): Promise<{ editor: boolean; schedule_button: boolean }> {
  await openComposer(nav);
  try {
    const schedule = await findOptional(nav.page, SEL.composer.scheduleButton, { timeout: 4000 });
    return { editor: true, schedule_button: schedule !== null };
  } finally {
    await closeComposer(nav);
  }
}

/** Opens the composer's scheduled-posts list, reads it and closes the composer. Types nothing. */
async function readScheduledList(nav: Nav): Promise<ScheduledPost[]> {
  await openComposer(nav);
  try {
    const clock = await find(nav.page, SEL.composer.scheduleButton, { timeout: 8000 });
    await clock.click();
    await nav.pacer.beat();
    const viewAll = await find(nav.page, SEL.schedule.viewAll, { timeout: 8000 });
    await viewAll.click();
    await nav.pacer.beat(1500, 2500);
    const snaps = await extractSnapshots(nav.page, EXTRACT.scheduledPost);
    return snaps.map((s) => parseScheduledRow(s.text)).filter((p) => p.text || p.scheduled_for);
  } finally {
    await closeComposer(nav);
  }
}

export async function listScheduled(nav: Nav): Promise<ScheduledPost[]> {
  return readScheduledList(nav);
}
