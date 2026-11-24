import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError } from "../../errors.js";
import { extractSnapshots, find, findOptional, waitForAny } from "../dom.js";
import { type Company, parseCompany } from "../parse/company.js";
import { type Profile, type ProfileSection, parseProfile } from "../parse/profile.js";
import { EXTRACT, SEL } from "../selectors.js";
import { companyAboutUrl, profileUrl, urls } from "../urls.js";

async function readProfilePage(nav: Nav, sections: readonly ProfileSection[], url: string): Promise<Profile> {
  await waitForAny(nav.page, ["main h1"], 15_000);
  // Lower sections load as you scroll.
  if (sections.some((s) => s !== "about")) await nav.pacer.scroll(nav.page, 3);
  const [top] = await extractSnapshots(nav.page, EXTRACT.profileTop);
  if (!top) throw new LinkedInMcpError("INVALID_INPUT", "That profile could not be loaded.", "Check the profile URL or username.", { url });
  const sectionSnaps = await extractSnapshots(nav.page, EXTRACT.profileSection);
  return parseProfile(top, sectionSnaps, sections, url);
}

export async function readPersonProfile(nav: Nav, input: string, sections: readonly ProfileSection[]): Promise<Profile> {
  const url = profileUrl(input);
  await nav.goto(url, { waitFor: ["main h1"] });
  if (/\/404|unavailable/i.test(nav.page.url())) {
    throw new LinkedInMcpError("INVALID_INPUT", "That profile does not exist or is not visible to you.", "Check the URL or username.", { url });
  }
  return readProfilePage(nav, sections, url);
}

/** Your own profile. Also returns your public identifier from the /in/me/ redirect. */
export async function readMyProfile(nav: Nav, sections: readonly ProfileSection[]): Promise<Profile & { public_id: string | null }> {
  await nav.goto(urls.me(), { waitFor: ["main h1"] });
  const finalUrl = nav.page.url();
  const id = /\/in\/([^/?#]+)/.exec(finalUrl)?.[1] ?? null;
  const url = id ? `https://www.linkedin.com/in/${id}/` : finalUrl;
  const profile = await readProfilePage(nav, sections, url);
  return { ...profile, public_id: id ? decodeURIComponent(id) : null };
}

export async function readCompany(nav: Nav, input: string): Promise<Company> {
  const url = companyAboutUrl(input);
  await nav.goto(url, { waitFor: ["main h1"] });
  const [snap] = await extractSnapshots(nav.page, EXTRACT.companyAbout);
  if (!snap) throw new LinkedInMcpError("INVALID_INPUT", "That company page could not be loaded.", "Check the company URL or slug.", { url });
  return parseCompany(snap, url.replace(/about\/$/, ""));
}

export type ConnectResult =
  | { status: "sent"; note_included: boolean }
  | { status: "already_pending" }
  | { status: "already_connected" };

export async function sendConnectionRequest(nav: Nav, input: string, note: string | undefined): Promise<ConnectResult> {
  const url = profileUrl(input);
  await nav.goto(url, { waitFor: ["main h1"] });
  if (await findOptional(nav.page, SEL.profile.pending, { timeout: 1500 })) return { status: "already_pending" };

  let connect = await findOptional(nav.page, SEL.profile.connect, { timeout: 3000 });
  if (!connect) {
    const more = await findOptional(nav.page, SEL.profile.moreActions, { timeout: 4000 });
    if (more) {
      await more.click();
      await nav.pacer.beat();
      connect = await findOptional(nav.page, SEL.profile.connectInMenu, { timeout: 4000 });
    }
  }
  if (!connect) {
    const degree = (await nav.page.locator("main").first().innerText().catch(() => "")).slice(0, 1500);
    if (/\b1st\b/.test(degree)) return { status: "already_connected" };
    throw new LinkedInMcpError("INVALID_INPUT", "This profile has no Connect option for you (it may be Follow-only, or invitations may be limited).", "Try messaging or following them on LinkedIn instead.", { url });
  }
  await connect.click();
  await nav.pacer.beat(800, 1500);

  if (note) {
    const addNote = await find(nav.page, SEL.connect.addNote, { timeout: 6000 });
    await addNote.click();
    await nav.pacer.beat();
    const box = await find(nav.page, SEL.connect.note, { timeout: 6000 });
    const max = Number((await box.getAttribute("maxlength")) ?? "300");
    if (Number.isFinite(max) && [...note].length > max) {
      const dismiss = await findOptional(nav.page, SEL.composer.dismiss, { timeout: 1500 });
      if (dismiss) await dismiss.click();
      throw new LinkedInMcpError("INVALID_INPUT", `Your note is ${[...note].length} characters, but LinkedIn allows ${max} on this account.`, `Shorten the note to ${max} characters or fewer.`, { max });
    }
    await box.click();
    await nav.pacer.typeText(nav.page, note);
    await nav.pacer.beat();
    const send = await find(nav.page, SEL.connect.send, { timeout: 6000 });
    await send.click();
  } else {
    const send = (await findOptional(nav.page, SEL.connect.sendWithoutNote, { timeout: 4000 })) ?? (await find(nav.page, SEL.connect.send, { timeout: 4000 }));
    await send.click();
  }
  await nav.pacer.beat(1200, 2200);
  return { status: "sent", note_included: Boolean(note) };
}
