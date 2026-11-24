import { HREF, WORDS } from "../anchors.js";
import { sameName } from "./inbox.js";

/**
 * Connection-request state, read from the profile top card's links and
 * buttons. Decisions use hrefs wherever LinkedIn provides them:
 *
 * - `/preload/custom-invite/?vanityName=…`: a Connect action, for that person
 * - `/messaging/compose/`: a Message action
 * - `/in/<you>/edit/intro/`: your own profile
 *
 * "Pending" has no href, so it is matched on the control's own label.
 */

export interface TopCardLink {
  href: string;
  label: string;
  text: string;
  visible: boolean;
}

export interface TopCardButton {
  label: string;
  text: string;
  visible: boolean;
  disabled: boolean;
}

/** What the in-page reader returns for the top card element. */
export interface TopCardSnapshot {
  name: string | null;
  links: TopCardLink[];
  buttons: TopCardButton[];
}

export type ConnectControl =
  | { kind: "link"; href: string; vanity: string | null; forTarget: boolean }
  | { kind: "button"; label: string; forTarget: boolean };

export interface TopCardState {
  name: string | null;
  self: boolean;
  pending: boolean;
  connect: ConnectControl | null;
  message: boolean;
}

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** The public id in a profile URL ("…/in/jane-doe/?isSelfProfile=false" → "jane-doe"). */
export function profileIdFromUrl(url: string | null | undefined): string | null {
  const m = url ? HREF.profileId.exec(url) : null;
  return m ? decode(m[1]!) : null;
}

/** The vanityName a custom-invite link is for, or null when it has none. */
export function inviteVanity(href: string): string | null {
  const m = HREF.customInvite.exec(href);
  return m ? decode(m[1]!) : null;
}

function controlText(c: { label: string; text: string }): string[] {
  return [c.label.trim(), c.text.trim()].filter(Boolean);
}

/**
 * Pure: reads the top card. `ids` are the public ids the profile may be under
 * (the one requested and the one in the page URL after redirects).
 */
export function topCardState(snap: TopCardSnapshot, opts: { ids: (string | null)[]; pageUrl?: string }): TopCardState {
  const ids = opts.ids.filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase());
  const links = snap.links.filter((l) => l.visible);
  const buttons = snap.buttons.filter((b) => b.visible);

  const self = snap.links.some((l) => HREF.editIntro.test(l.href)) || /[?&]isSelfProfile=true\b/i.test(opts.pageUrl ?? "");
  const pending = [...links, ...buttons].some((c) => controlText(c).some((t) => WORDS.pending.test(t)));
  const message = links.some((l) => HREF.messageCompose.test(l.href)) || buttons.some((b) => controlText(b).some((t) => WORDS.message.test(t)));

  let connect: ConnectControl | null = null;
  const inviteLink = links.find((l) => HREF.customInvite.test(l.href) || /\/preload\/custom-invite\//i.test(l.href));
  if (inviteLink) {
    const vanity = inviteVanity(inviteLink.href);
    connect = { kind: "link", href: inviteLink.href, vanity, forTarget: vanity === null || ids.length === 0 || ids.includes(vanity.toLowerCase()) };
  } else {
    const inviteButton = buttons.find((b) => !b.disabled && WORDS.inviteToConnect.test(b.label.trim()));
    if (inviteButton) {
      const who = WORDS.inviteToConnect.exec(inviteButton.label.trim())?.[1] ?? null;
      connect = { kind: "button", label: inviteButton.label, forTarget: !snap.name || !who || sameName(snap.name, who) };
    }
  }
  return { name: snap.name, self, pending, connect, message };
}

export type ConnectPlan =
  | { kind: "self" }
  | { kind: "pending" }
  | { kind: "wrong_person"; found: string | null }
  | { kind: "click_top_card" }
  | { kind: "try_more_menu" };

/** Pure: what to do first, from the top card alone. */
export function planConnect(state: TopCardState): ConnectPlan {
  if (state.self) return { kind: "self" };
  if (state.pending) return { kind: "pending" };
  if (state.connect) {
    if (state.connect.forTarget) return { kind: "click_top_card" };
    return { kind: "wrong_person", found: state.connect.kind === "link" ? state.connect.vanity : state.connect.label };
  }
  return { kind: "try_more_menu" };
}

/**
 * Pure: whether a Connect item found in the More menu is for this profile.
 * A custom-invite link must name one of `ids`; an "Invite X to connect" label
 * must name the top card's person. A plain "Connect" item is taken as the
 * top card's own, since the menu was opened from the top card.
 */
export function menuItemForTarget(item: { href: string | null; label: string }, topName: string | null, ids: (string | null)[]): boolean {
  if (item.href) {
    const vanity = inviteVanity(item.href);
    const want = ids.filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase());
    return vanity === null || want.length === 0 || want.includes(vanity.toLowerCase());
  }
  const who = WORDS.inviteToConnect.exec(item.label.trim())?.[1];
  return !who || !topName || sameName(topName, who);
}

/** Pure: why there is nothing to click when neither the top card nor the More menu offers Connect. */
export function noConnectReason(state: TopCardState): "already_connected" | "no_connect_option" {
  return state.message ? "already_connected" : "no_connect_option";
}

// --- The invite dialog -------------------------------------------------------

export interface DialogAction {
  text: string;
  label: string;
  disabled: boolean;
}

/** What the in-page reader returns for the invite dialog. */
export interface InviteDialogSnapshot {
  noteBox: boolean;
  noteMax: number | null;
  emailInput: boolean;
  premiumLinks: number;
  /** Visible buttons with text, in document order (icon-only buttons such as Dismiss are left out). */
  actions: DialogAction[];
}

/** Where we are in the flow when reading the dialog. */
export type InviteStage = "after_connect" | "after_add_note";

export type InviteStep = "note_form" | "add_note_prompt" | "email_required" | "premium_note_limit" | "unknown";

/**
 * Pure: classifies the dialog from its structure, not its wording.
 *
 * - A note box means the note form, even with a Premium banner next to it:
 *   a banner alone doesn't mean the free note quota is used up.
 * - An email input means LinkedIn wants the member's email address.
 * - Right after "Add a note", no note box plus a Premium link is the
 *   note-limit upsell.
 * - Right after Connect, two or more labelled buttons and no inputs is the
 *   "Add a note?" step.
 */
export function classifyInviteDialog(d: InviteDialogSnapshot, stage: InviteStage): InviteStep {
  if (d.noteBox) return "note_form";
  if (d.emailInput) return "email_required";
  if (stage === "after_add_note") return d.premiumLinks > 0 ? "premium_note_limit" : "unknown";
  return d.actions.length >= 2 ? "add_note_prompt" : "unknown";
}
