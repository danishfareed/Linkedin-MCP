import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORDS } from "../../src/linkedin/anchors.js";
import { type Bubble, headerMatchesRecipient, linksToProfile, nameTokens, newOwnBubble, sameName } from "../../src/linkedin/parse/inbox.js";
import {
  type InviteDialogSnapshot,
  type TopCardSnapshot,
  classifyInviteDialog,
  inviteVanity,
  menuItemForTarget,
  noConnectReason,
  planConnect,
  profileIdFromUrl,
  topCardState,
} from "../../src/linkedin/parse/invite.js";
import { alreadyReacted, containsText, editorHolds, newMatchingItem, normaliseForMatch, reactionApplied, textProbe } from "../../src/linkedin/parse/verify.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

describe("connection state from the top card", () => {
  const cards = json<Record<string, TopCardSnapshot>>("top-cards.json");
  const ids = ["jordan-lee-0401", null];
  const state = (name: string, opts: { ids?: (string | null)[]; pageUrl?: string } = {}) => topCardState(cards[name]!, { ids: opts.ids ?? ids, pageUrl: opts.pageUrl });

  it("finds a custom-invite link for this person and clicks it from the top card", () => {
    const s = state("connectable_link");
    expect(s.connect).toMatchObject({ kind: "link", vanity: "jordan-lee-0401", forTarget: true });
    expect(s).toMatchObject({ self: false, pending: false, message: false });
    expect(planConnect(s)).toEqual({ kind: "click_top_card" });
  });

  it("detects Pending from the control's own label, ignoring hidden controls", () => {
    expect(planConnect(state("pending"))).toEqual({ kind: "pending" });
    expect(state("pending_hidden").pending).toBe(false);
  });

  it("detects your own profile from the edit-intro link or the isSelfProfile flag", () => {
    expect(planConnect(state("self"))).toEqual({ kind: "self" });
    expect(state("follow_primary", { pageUrl: "https://www.linkedin.com/in/riley-chen/?isSelfProfile=true" }).self).toBe(true);
    expect(state("follow_primary", { pageUrl: "https://www.linkedin.com/in/riley-chen/?isSelfProfile=false" }).self).toBe(false);
  });

  it("goes to the More menu when the top card has no Connect", () => {
    expect(planConnect(state("follow_primary", { ids: ["riley-chen-0301"] }))).toEqual({ kind: "try_more_menu" });
    expect(planConnect(state("message_only", { ids: ["casey-morgan-0402"] }))).toEqual({ kind: "try_more_menu" });
  });

  it("calls a profile with only Message 'already connected', and one with neither 'no connect option'", () => {
    expect(noConnectReason(state("message_only"))).toBe("already_connected");
    expect(noConnectReason(state("follow_primary"))).toBe("no_connect_option");
  });

  it("refuses a Connect control that belongs to someone else", () => {
    expect(planConnect(state("wrong_vanity"))).toEqual({ kind: "wrong_person", found: "someone-else-0499" });
    expect(planConnect(state("old_button"))).toEqual({ kind: "click_top_card" });
    expect(planConnect(state("old_button_other_person"))).toMatchObject({ kind: "wrong_person" });
  });

  it("accepts the vanity name the page redirected to", () => {
    expect(state("wrong_vanity", { ids: ["jordan-lee-0401", "someone-else-0499"] }).connect).toMatchObject({ forTarget: true });
  });

  it("checks a More-menu Connect item is for this person", () => {
    expect(menuItemForTarget({ href: "https://www.linkedin.com/preload/custom-invite/?vanityName=jordan-lee-0401", label: "" }, "Jordan Lee", ids)).toBe(true);
    expect(menuItemForTarget({ href: "https://www.linkedin.com/preload/custom-invite/?vanityName=sam-park", label: "" }, "Jordan Lee", ids)).toBe(false);
    expect(menuItemForTarget({ href: null, label: "Invite Jordan Lee to connect" }, "Jordan Lee", ids)).toBe(true);
    expect(menuItemForTarget({ href: null, label: "Invite Sam Park to connect" }, "Jordan Lee", ids)).toBe(false);
    expect(menuItemForTarget({ href: null, label: "Connect" }, "Jordan Lee", ids)).toBe(true);
  });

  it("reads profile ids and invite vanity names from URLs", () => {
    expect(profileIdFromUrl("https://www.linkedin.com/in/jordan-lee-0401/?isSelfProfile=false")).toBe("jordan-lee-0401");
    expect(profileIdFromUrl("https://www.linkedin.com/in/j%C3%B6rg-m/")).toBe("jörg-m");
    expect(profileIdFromUrl("https://www.linkedin.com/feed/")).toBeNull();
    expect(inviteVanity("https://www.linkedin.com/preload/custom-invite/?vanityName=jordan-lee-0401&from=profile")).toBe("jordan-lee-0401");
    expect(inviteVanity("https://www.linkedin.com/preload/custom-invite/?from=profile&vanityName=a%2Db")).toBe("a-b");
  });

  it("matches 'Connect' exactly in the More menu, so 'Remove connection' can't match", async () => {
    const { SEL } = await import("../../src/linkedin/selectors.js");
    for (const c of SEL.profile.connectInMenu.candidates) {
      if ("role" in c && typeof c.name === "string") expect(c.exact).toBe(true);
      if ("role" in c && c.name instanceof RegExp) expect(c.name.test("Remove connection")).toBe(false);
    }
  });
});

describe("invite dialog classification", () => {
  const d = json<Record<string, InviteDialogSnapshot>>("invite-dialogs.json");

  it("recognises the 'Add a note?' step, even with a Premium banner", () => {
    expect(classifyInviteDialog(d.add_note_prompt!, "after_connect")).toBe("add_note_prompt");
    expect(classifyInviteDialog(d.add_note_prompt_with_premium_banner!, "after_connect")).toBe("add_note_prompt");
  });

  it("treats a note box as the note form, whatever banner sits next to it", () => {
    expect(classifyInviteDialog(d.note_form!, "after_connect")).toBe("note_form");
    expect(classifyInviteDialog(d.note_form_with_premium_banner!, "after_add_note")).toBe("note_form");
  });

  it("calls it the note-limit upsell only when the note box is missing after Add a note", () => {
    expect(classifyInviteDialog(d.premium_note_limit!, "after_add_note")).toBe("premium_note_limit");
    expect(classifyInviteDialog(d.add_note_prompt!, "after_add_note")).toBe("unknown");
  });

  it("detects the email-required prompt and leaves unknown dialogs alone", () => {
    expect(classifyInviteDialog(d.email_required!, "after_connect")).toBe("email_required");
    expect(classifyInviteDialog(d.email_required!, "after_add_note")).toBe("email_required");
    expect(classifyInviteDialog(d.weekly_limit_notice!, "after_connect")).toBe("unknown");
  });
});

describe("recipient name matching", () => {
  it("normalises case, accents, pronouns, credentials and emoji", () => {
    expect(nameTokens("José Álvarez-Núñez (he/him), MBA 🚀")).toEqual(["jose", "alvarez-nunez"]);
    expect(nameTokens("Dr. Jane Q. Doe PhD")).toEqual(["jane", "q", "doe"]);
    expect(nameTokens("Jane Doe • 1st")).toEqual(["jane", "doe"]);
  });

  it("compares first and last names", () => {
    expect(sameName("Jane Doe", "jane doe")).toBe(true);
    expect(sameName("Zoë Ångström", "Zoe Angstrom")).toBe(true);
    expect(sameName("Jane Doe", "Jane Marie Doe")).toBe(true);
    expect(sameName("Jane Doe", "Jane Smith")).toBe(false);
    expect(sameName("Jane Doe", "John Doe")).toBe(false);
    expect(sameName("Jane Doe", "Jane")).toBe(false);
    expect(sameName("Prince", "prince")).toBe(true);
    expect(sameName("", "Jane Doe")).toBe(false);
    expect(sameName("İlkay Gündoğan", "Ilkay Gundogan")).toBe(true);
  });

  it("accepts a header that links to the same profile or names the same person", () => {
    const expected = { name: "Jordan Lee", id: "jordan-lee-0401" };
    expect(headerMatchesRecipient({ lines: ["Messaging"], profileLinks: ["https://www.linkedin.com/in/jordan-lee-0401/"] }, expected)).toBe(true);
    expect(headerMatchesRecipient({ lines: ["Jordan Lee", "Active now"], profileLinks: [] }, expected)).toBe(true);
    expect(headerMatchesRecipient({ lines: ["Sam Park", "Active now"], profileLinks: ["https://www.linkedin.com/in/sam-park/"] }, expected)).toBe(false);
    expect(headerMatchesRecipient({ lines: ["New message"], profileLinks: [] }, expected)).toBe(false);
  });

  it("matches profile links exactly, not by prefix", () => {
    expect(linksToProfile("https://www.linkedin.com/in/jane/", "jane")).toBe(true);
    expect(linksToProfile("https://www.linkedin.com/in/jane-doe/", "jane")).toBe(false);
    expect(linksToProfile("https://www.linkedin.com/in/Jane?trk=x", "jane")).toBe(true);
    expect(linksToProfile(null, "jane")).toBe(false);
  });
});

describe("sent-message verification", () => {
  const f = json<{ text: string; before: Bubble[]; after_sent: Bubble[]; after_other_replied_same: Bubble[]; after_unknown_owner: Bubble[] }>("message-bubbles.json");

  it("needs a new bubble of yours with the text; an earlier identical message doesn't count", () => {
    expect(newOwnBubble(f.before, f.before, f.text)).toBe(false);
    expect(newOwnBubble(f.before, f.after_sent, f.text)).toBe(true);
  });

  it("ignores the other person's bubbles", () => {
    expect(newOwnBubble(f.before, f.after_other_replied_same, f.text)).toBe(false);
  });

  it("counts bubbles whose owner can't be told, with whitespace normalised", () => {
    expect(newOwnBubble(f.after_unknown_owner.slice(0, 2), f.after_unknown_owner, f.text)).toBe(true);
  });
});

describe("verification helpers", () => {
  it("matches on the normalised beginning of the text, ignoring URLs", () => {
    expect(normaliseForMatch("a​  b\n c https://lnkd.in/x d")).toBe("a b c d");
    expect(textProbe("x".repeat(150))).toHaveLength(100);
    expect(containsText("Great post! Read more: https://lnkd.in/abc", "Great post! Read more: https://example.com/a/very/long/link")).toBe(true);
    expect(containsText("anything", "   ")).toBe(false);
  });

  it("counts new items rather than searching, so an earlier identical comment can't pass", () => {
    expect(newMatchingItem(["Congrats!"], ["Congrats!"], "Congrats!")).toBe(false);
    expect(newMatchingItem(["Congrats!"], ["Congrats!", "Congrats!"], "Congrats!")).toBe(true);
    expect(newMatchingItem([], ["Something else"], "Congrats!")).toBe(false);
  });

  it("checks the editor holds the approved text before sending", () => {
    expect(editorHolds("@Jordan Lee Thanks for sharing this", "Thanks for sharing this")).toBe(true);
    expect(editorHolds("", "Thanks")).toBe(false);
    expect(editorHolds("Thanks for sh", "Thanks for sharing this")).toBe(false);
  });

  it("detects a reaction from aria-pressed or a changed label", () => {
    const before = { pressed: "false", label: "React Like", text: "Like" };
    expect(reactionApplied(before, { pressed: "true", label: "React Like", text: "Like" }, "like", WORDS.reacted, WORDS.notReacted)).toBe(true);
    expect(reactionApplied(before, { pressed: null, label: "Unreact Like", text: "Like" }, "like", WORDS.reacted, WORDS.notReacted)).toBe(true);
    expect(reactionApplied(before, { pressed: "false", label: "Celebrate", text: "Celebrate" }, "celebrate", WORDS.reacted, WORDS.notReacted)).toBe(true);
    expect(reactionApplied(before, before, "like", WORDS.reacted, WORDS.notReacted)).toBe(false);
    expect(reactionApplied(before, { pressed: "false", label: "React Like", text: "Celebrate" }, "celebrate", WORDS.reacted, WORDS.notReacted)).toBe(true);
  });

  it("detects an existing reaction before doing anything", () => {
    expect(alreadyReacted({ pressed: "true", label: "React Like", text: "Like" }, WORDS.reacted)).toBe(true);
    expect(alreadyReacted({ pressed: null, label: "Remove your reaction", text: "Love" }, WORDS.reacted)).toBe(true);
    expect(alreadyReacted({ pressed: "false", label: "React Like", text: "Like" }, WORDS.reacted)).toBe(false);
  });
});
