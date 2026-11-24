import type { SelectorEntry } from "./selectors.js";

/**
 * Structural anchors used to scope write actions and to read their state:
 * link hrefs, ARIA roles and element structure, which survive LinkedIn's
 * class-name churn and don't depend on the display language.
 *
 * The few English words that state detection still needs live at the bottom
 * of this file (WORDS), so there is one place to look when LinkedIn renames
 * something. Write actions are gated to LinkedIn's English interface (see
 * language.ts), so these only ever run against English labels.
 *
 * Click targets that are found by role and name stay in selectors.ts.
 */

/** The profile top card: the first section in <main> holding the name heading (h1, or h2 since 2026). */
export const TOP_CARD = ["main section:has(h1)", "main section:has(h2)"] as const;

/** Waited on after opening a profile. */
export const PROFILE_READY = ["main h1", "main section h2"] as const;

/** Modal dialogs. Message overlays (inside an aside / #msg-overlay) are excluded in code. */
export const DIALOG = "[role='dialog'], [role='alertdialog']";
export const DIALOG_EXCLUDE_INSIDE = "aside, #msg-overlay";

export const HREF = {
  /** Connect button rendered as a link (2025+). Its vanityName names the person. */
  customInvite: /\/preload\/custom-invite\/?\?(?:[^#]*&)?vanityName=([^&#]+)/i,
  /** Message button rendered as a link. */
  messageCompose: /\/messaging\/compose\//i,
  /** Only on your own profile. */
  editIntro: /\/in\/[^/?#]+\/edit\/(?:forms\/)?intro\b/i,
  /** Premium upsell links. */
  premiumCss: "a[href*='/premium']",
  /** Details pages behind a section's "Show all" link. */
  details: (section: string) => new RegExp(`/in/[^/?#]+/details/${section}/?(?:[?#]|$)`, "i"),
  profileId: /\/in\/([^/?#]+)/i,
} as const;

/** Inputs inside the invite dialog. */
export const INVITE_DIALOG = {
  noteBox: "textarea",
  email: "input[type='email'], input[name*='email' i], input[id*='email' i], input[autocomplete='email']",
} as const;

/** Toasts LinkedIn shows after publishing ("Post successful. View post"). */
export const TOAST = "[role='alert'], .artdeco-toast-item, [data-test-artdeco-toast-item-type]";

/** Comment editor/composer elements, excluded when reading a comment's own text. */
export const EDITABLE = "[contenteditable='true'], textarea, form";

/** The conversation containing a message editor: its nearest ancestor with a header. */
export const THREAD_FROM_EDITOR = "xpath=ancestor::*[.//header or .//h2][1]";

/** The form around an editor. */
export const FORM_FROM_EDITOR = "xpath=ancestor::form[1]";

/** The profile's opened More menu, searched for SEL.profile.connectInMenu. */
export const PROFILE_MENU: SelectorEntry = {
  name: "profile.menu",
  candidates: [
    { css: "div.artdeco-dropdown__content--is-open" },
    { css: "[role='menu']" },
    { css: "div.artdeco-dropdown__content[aria-hidden='false']" },
  ],
};

/** "Show more results" / "Load more" buttons at the bottom of a list. */
export const LOAD_MORE: SelectorEntry = {
  name: "list.loadMore",
  candidates: [
    { role: "button", name: /^(show more results|see more results|load more( results| conversations| invitations)?)$/i },
    { css: "button.scaffold-finite-scroll__load-button" },
  ],
};

/**
 * English words for state detection. Keep every one of them here.
 * Each is matched against an aria-label or a button's own text, never
 * against free page text.
 */
export const WORDS = {
  /** The top card's "Pending" button after an invitation was sent. */
  pending: /^pending\b/i,
  /** Top card connect button in older layouts: "Invite Jane Doe to connect". */
  inviteToConnect: /^invite (.+) to connect$/i,
  /** Message button label: "Message Jane Doe" or "Message". */
  message: /^message\b/i,
  /** Like button label once you've reacted. */
  reacted: /^(unlike|unreact|undo|remove( your)? reaction)\b/i,
  /** Like button label before reacting. */
  notReacted: /^react\b|^like$/i,
} as const;
