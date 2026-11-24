/**
 * Every LinkedIn selector lives in this file.
 *
 * LinkedIn's CSS classes are generated and change often, so interaction
 * selectors prefer ARIA roles, accessible names and visible text, with CSS
 * classes only as later fallbacks. Each entry is an ordered list: the first
 * candidate that is visible wins.
 *
 * When LinkedIn changes its layout, this is the file to fix. Add the new
 * selector at the top of the list and keep the old ones below it for a while,
 * since LinkedIn rolls changes out gradually.
 */

type AriaRole =
  | "button"
  | "link"
  | "textbox"
  | "dialog"
  | "menuitem"
  | "radio"
  | "option"
  | "combobox"
  | "heading"
  | "main"
  | "navigation"
  | "list"
  | "listitem"
  | "article";

export type Candidate =
  | { role: AriaRole; name?: RegExp | string; exact?: boolean }
  | { label: RegExp | string }
  | { placeholder: RegExp | string }
  | { text: RegExp | string }
  | { css: string };

export interface SelectorEntry {
  /** Stable name used in SELECTOR_BROKEN errors and by `doctor`. */
  name: string;
  candidates: Candidate[];
}

const entry = (name: string, ...candidates: Candidate[]): SelectorEntry => ({ name, candidates });

// ---------------------------------------------------------------------------
// Interaction selectors (Playwright locators)
// ---------------------------------------------------------------------------

export const SEL = {
  globalNav: entry(
    "globalNav",
    { css: "#global-nav" },
    { css: "header.global-nav" },
    { role: "navigation", name: /primary navigation/i },
  ),

  composer: {
    startPost: entry(
      "composer.startPost",
      { role: "button", name: /^start a post/i },
      { css: "button.share-box-feed-entry__trigger" },
      { text: /^Start a post/ },
    ),
    dialog: entry(
      "composer.dialog",
      { role: "dialog", name: /create (a )?post|share/i },
      { css: "div.share-box-modal" },
      { css: "div[role='dialog'] .share-creation-state" },
    ),
    editor: entry(
      "composer.editor",
      { role: "textbox", name: /text editor for creating content/i },
      { css: "div.share-creation-state__text-editor div.ql-editor[contenteditable='true']" },
      { css: "div[role='dialog'] div.ql-editor[contenteditable='true']" },
      { css: "div[role='dialog'] div[role='textbox'][contenteditable='true']" },
    ),
    postButton: entry(
      "composer.postButton",
      { role: "button", name: "Post", exact: true },
      { css: "button.share-actions__primary-action" },
    ),
    addMedia: entry(
      "composer.addMedia",
      { role: "button", name: /^add (a )?(media|photo)/i },
      { css: "button[aria-label*='media' i]" },
      { css: "button.share-promoted-detour-button[aria-label*='photo' i]" },
    ),
    moreOptions: entry(
      "composer.moreOptions",
      { role: "button", name: /^more$/i },
      { css: "button[aria-label='More']" },
    ),
    addDocument: entry(
      "composer.addDocument",
      { role: "button", name: /add a document/i },
      { css: "button[aria-label*='document' i]" },
    ),
    chooseFile: entry(
      "composer.chooseFile",
      { role: "button", name: /choose file|upload from computer|select files to share/i },
      { text: /^Choose file$/ },
      { css: "label[for*='file' i]" },
    ),
    documentTitle: entry(
      "composer.documentTitle",
      { label: /document title/i },
      { placeholder: /title/i },
      { css: "input[id*='document-title' i]" },
    ),
    mediaDone: entry(
      "composer.mediaDone",
      { role: "button", name: /^(done|next)$/i },
      { css: "button.share-box-footer__primary-btn" },
    ),
    visibilityButton: entry(
      "composer.visibilityButton",
      { role: "button", name: /post to (anyone|connections)|who can see your post|visibility/i },
      { css: "button.share-unified-settings-entry-button" },
      { css: "button.share-box__open-settings" },
    ),
    visibilityAnyone: entry(
      "composer.visibilityAnyone",
      { role: "radio", name: /^anyone/i },
      { label: /^anyone/i },
    ),
    visibilityConnections: entry(
      "composer.visibilityConnections",
      { role: "radio", name: /connections only/i },
      { label: /connections only/i },
    ),
    visibilityDone: entry(
      "composer.visibilityDone",
      { role: "button", name: /^(done|save)$/i },
    ),
    scheduleButton: entry(
      "composer.scheduleButton",
      { role: "button", name: /schedule post/i },
      { css: "button[aria-label*='schedule' i]" },
    ),
    discardConfirm: entry(
      "composer.discardConfirm",
      { role: "button", name: /^discard$/i },
    ),
    dismiss: entry(
      "composer.dismiss",
      { role: "button", name: /^dismiss$/i },
      { css: "button[aria-label='Dismiss']" },
    ),
  },

  schedule: {
    dateInput: entry(
      "schedule.dateInput",
      { label: /^date$/i },
      { css: "input[name*='scheduled-date' i]" },
      { css: "input[id*='scheduled-date' i]" },
      { placeholder: /mm\/dd\/yyyy|dd\/mm\/yyyy|yyyy/i },
    ),
    timeInput: entry(
      "schedule.timeInput",
      { label: /^time$/i },
      { css: "input[name*='scheduled-time' i]" },
      { css: "input[id*='scheduled-time' i]" },
      { role: "combobox", name: /time/i },
    ),
    next: entry("schedule.next", { role: "button", name: /^next$/i }),
    confirm: entry("schedule.confirm", { role: "button", name: /^schedule$/i }),
    viewAll: entry(
      "schedule.viewAll",
      { role: "button", name: /view all scheduled posts/i },
      { role: "link", name: /view all scheduled posts/i },
      { text: /View all scheduled posts/i },
    ),
  },

  post: {
    controlMenu: entry(
      "post.controlMenu",
      { role: "button", name: /open control menu|control menu for post|more actions/i },
      { css: "button.feed-shared-control-menu__trigger" },
    ),
    deleteItem: entry(
      "post.deleteItem",
      { role: "menuitem", name: /^delete post/i },
      { role: "button", name: /^delete post/i },
      { text: /^Delete post$/ },
    ),
    deleteConfirm: entry(
      "post.deleteConfirm",
      { role: "button", name: /^delete$/i },
      { css: "button.feed-components-shared-decision-modal__confirm-button" },
    ),
    likeButton: entry(
      "post.likeButton",
      { role: "button", name: /^react like|^like$|^(unlike|remove (your )?reaction)/i },
      { css: "button.react-button__trigger" },
      { css: "button[aria-label^='React Like']" },
    ),
    commentButton: entry(
      "post.commentButton",
      { role: "button", name: /^comment$/i },
      { css: "button.comment-button" },
    ),
    commentEditor: entry(
      "post.commentEditor",
      { role: "textbox", name: /add a comment|text editor for creating content/i },
      { css: "div.comments-comment-box__form div.ql-editor[contenteditable='true']" },
      { css: "div.comments-comment-texteditor div[contenteditable='true']" },
    ),
    commentSubmit: entry(
      "post.commentSubmit",
      { css: "button.comments-comment-box__submit-button--cr" },
      { css: "button.comments-comment-box__submit-button" },
      { role: "button", name: /^(post|comment|reply)$/i },
    ),
    loadMoreComments: entry(
      "post.loadMoreComments",
      { role: "button", name: /load more comments|show more comments|see more comments/i },
      { css: "button.comments-comments-list__load-more-comments-button" },
    ),
  },

  comment: {
    replyButton: entry(
      "comment.replyButton",
      { role: "button", name: /^reply/i },
      { css: "button.comments-comment-social-bar__reply-action-button--cr" },
    ),
    replyEditor: entry(
      "comment.replyEditor",
      { role: "textbox", name: /add a reply|reply|text editor/i },
      { css: "div.comments-comment-box--reply div[contenteditable='true']" },
    ),
  },

  // Profile actions are always looked up inside the top card (see TOP_CARD in
  // anchors.ts), never page-wide, so a sidebar "Connect" or "Message <someone
  // else>" can't be picked.
  profile: {
    connect: entry(
      "profile.connect",
      { css: "a[href*='/preload/custom-invite/']" },
      { role: "button", name: /^invite .+ to connect$/i },
      { css: "button[aria-label^='Invite'][aria-label$='to connect']" },
    ),
    moreActions: entry(
      "profile.moreActions",
      { role: "button", name: /^more actions$/i },
      { role: "button", name: "More", exact: true },
      { css: "button[aria-label='More actions']" },
    ),
    // Inside the opened More menu only. "Connect" is matched exactly, so
    // "Remove connection" can never match.
    connectInMenu: entry(
      "profile.connectInMenu",
      { css: "a[href*='/preload/custom-invite/']" },
      { role: "button", name: /^invite .+ to connect$/i },
      { role: "menuitem", name: "Connect", exact: true },
      { role: "button", name: "Connect", exact: true },
      { css: "[aria-label^='Invite'][aria-label$='to connect']" },
    ),
    pending: entry(
      "profile.pending",
      { role: "button", name: /^pending/i },
      { role: "link", name: /^pending/i },
      { css: "button[aria-label*='Pending' i]" },
    ),
    message: entry(
      "profile.message",
      { css: "a[href*='/messaging/compose/']" },
      { role: "button", name: /^message\b/i },
      { role: "link", name: /^message\b/i },
    ),
  },

  // Everything in the invite flow is looked up inside the dialog that opened
  // after the Connect click. When a name doesn't match, the dialog's buttons
  // are picked by position (the last labelled button is the primary action).
  connect: {
    addNote: entry("connect.addNote", { role: "button", name: /^add a (free )?note/i }),
    note: entry(
      "connect.note",
      { css: "textarea#custom-message" },
      { css: "textarea[name='message']" },
      { css: "textarea" },
      { role: "textbox" },
    ),
    send: entry(
      "connect.send",
      { role: "button", name: /^send( invitation| now)?$/i },
      { css: "button[aria-label='Send now']" },
      { css: "button[aria-label='Send invitation']" },
    ),
    sendWithoutNote: entry(
      "connect.sendWithoutNote",
      { role: "button", name: /^send without a note/i },
    ),
  },

  // Looked up inside the matching invitation card only.
  invitations: {
    accept: entry("invitations.accept", { role: "button", name: /^accept\b/i }),
    ignore: entry("invitations.ignore", { role: "button", name: /^ignore\b/i }),
  },

  // The editor and Send button are looked up inside one conversation (the
  // overlay or thread the editor belongs to). With LinkedIn's "Press Enter to
  // Send" setting there is no Send button and Enter sends.
  messaging: {
    editor: entry(
      "messaging.editor",
      { role: "textbox", name: /write a message/i },
      { css: "div.msg-form__contenteditable[contenteditable='true']" },
      { css: "form div[contenteditable='true'][role='textbox']" },
    ),
    send: entry(
      "messaging.send",
      { css: "button.msg-form__send-button" },
      { css: "button[type='submit']" },
      { role: "button", name: /^send$/i },
    ),
    closeOverlay: entry(
      "messaging.closeOverlay",
      { role: "button", name: /close your (conversation|draft)/i },
      { css: "button.msg-overlay-bubble-header__control[aria-label*='Close' i]" },
      { css: "aside#msg-overlay header button[aria-label^='Close' i]" },
    ),
  },
} as const;

// ---------------------------------------------------------------------------
// Extraction specs (CSS only; they run inside the page to build snapshots)
// ---------------------------------------------------------------------------

export interface ExtractSpec {
  /** CSS candidates for each item container. The first that matches anything wins. */
  container: string[];
  /** Named sub-elements whose text is captured. First matching CSS wins. */
  fields?: Record<string, string[]>;
  /** Named attributes captured from sub-elements, e.g. a profile link's href. */
  attrs?: Record<string, { css: string[]; attr: string }>;
  /** CSS candidates for list items inside the container (top-level only). */
  items?: string[];
  /** Keep containers nested inside other containers (comment replies). Default: drop them. */
  keepNested?: boolean;
  limit?: number;
}

const POST_FIELDS: Record<string, string[]> = {
  actorName: [
    ".update-components-actor__title span[aria-hidden='true']",
    ".update-components-actor__name span[aria-hidden='true']",
    ".update-components-actor__title",
    ".update-components-actor__name",
  ],
  actorHeadline: [
    ".update-components-actor__description span[aria-hidden='true']",
    ".update-components-actor__description",
  ],
  actorTime: [
    ".update-components-actor__sub-description span[aria-hidden='true']",
    ".update-components-actor__sub-description",
  ],
  header: [".update-components-header__text-view", ".update-components-header"],
  text: [
    ".update-components-text",
    ".feed-shared-inline-show-more-text",
    ".feed-shared-update-v2__description",
    ".feed-shared-text",
  ],
  reactions: [
    ".social-details-social-counts__reactions-count",
    ".social-details-social-counts__social-proof-fallback-number",
    "button[aria-label*='reaction' i]",
  ],
  comments: [
    "button[aria-label*='comment' i].social-details-social-counts__btn",
    "li.social-details-social-counts__comments",
  ],
  reposts: [
    "button[aria-label*='repost' i].social-details-social-counts__btn",
    "li.social-details-social-counts__item--right-aligned button[aria-label*='repost' i]",
  ],
  impressions: [".ca-entry-point__num-views", "a[href*='/analytics/post-summary/']", ".analytics-entry-point"],
};

const POST_ATTRS: ExtractSpec["attrs"] = {
  actorLink: {
    css: [
      "a.update-components-actor__meta-link",
      "a.update-components-actor__image",
      ".update-components-actor__container a[href*='/in/']",
      ".update-components-actor__container a[href*='/company/']",
    ],
    attr: "href",
  },
  postLink: { css: ["a[href*='/feed/update/urn:li:activity:']", "a[href*='/posts/']"], attr: "href" },
};

const POST_CONTAINERS = [
  "div[data-urn^='urn:li:activity:']",
  "div[data-id^='urn:li:activity:']",
  "div[data-urn^='urn:li:aggregate:']",
  "div.feed-shared-update-v2",
];

const RESULT_CONTAINERS = [
  "div[data-chameleon-result-urn]",
  "li.reusable-search__result-container",
  "div.entity-result",
  "main ul[role='list'] > li",
];

export const EXTRACT = {
  feedPost: { container: POST_CONTAINERS, fields: POST_FIELDS, attrs: POST_ATTRS } satisfies ExtractSpec,

  comment: {
    container: [
      "article.comments-comment-entity",
      "article.comments-comment-item",
      "article[data-id^='urn:li:comment:']",
      "div[data-id^='urn:li:comment:']",
    ],
    keepNested: true,
    fields: {
      author: [
        ".comments-comment-meta__description-title",
        ".comments-post-meta__name-text span[aria-hidden='true']",
        ".comments-post-meta__name-text",
      ],
      headline: [".comments-comment-meta__description-subtitle", ".comments-post-meta__headline"],
      text: [
        ".comments-comment-item__main-content",
        ".comments-comment-entity__content .update-components-text",
        ".update-components-text",
      ],
      time: ["time.comments-comment-meta__data", ".comments-comment-meta__data time", "time"],
      reactions: [
        "button.comments-comment-social-bar__reactions-count--cr",
        "button.comments-comment-social-bar__reactions-count",
      ],
    },
    attrs: {
      authorLink: {
        css: [
          "a.comments-comment-meta__image-link",
          "a.comments-comment-meta__description-container",
          "a.comments-post-meta__actor-link",
          "a[href*='/in/']",
        ],
        attr: "href",
      },
    },
  } satisfies ExtractSpec,

  // The top card first (the section holding the name heading), then all of
  // main. LinkedIn moved the name from h1 to h2 in 2026.
  profileTop: {
    container: ["main section:has(h1)", "main section:has(h2)", "main"],
    fields: {
      name: ["h1", "h2"],
      headline: ["div.text-body-medium.break-words", ".pv-text-details__left-panel .text-body-medium"],
      location: [
        "span.text-body-small.inline.t-black--light.break-words",
        ".pv-text-details__left-panel span.text-body-small",
      ],
      connections: ["a[href*='/mynetwork/'] span.t-bold", "li.text-body-small span.t-bold"],
      followers: ["a[href*='/followers'] span.t-bold", "p.pvs-header__optional-link"],
    },
    limit: 1,
  } satisfies ExtractSpec,

  profileSection: {
    container: ["main section.artdeco-card", "main section"],
    fields: {
      heading: ["h2 span[aria-hidden='true']", "h2"],
      about: [
        "div.inline-show-more-text span[aria-hidden='true']",
        "div.inline-show-more-text",
        "div.pv-shared-text-with-see-more span[aria-hidden='true']",
      ],
    },
    attrs: { anchor: { css: ["div.pv-profile-card__anchor", ":scope > div[id]"], attr: "id" } },
    items: ["li.artdeco-list__item", "li.pvs-list__paged-list-item", "ul > li"],
  } satisfies ExtractSpec,

  companyAbout: {
    container: ["main"],
    fields: {
      name: ["h1"],
      tagline: [".org-top-card-summary__tagline", "p.org-top-card-summary__tagline"],
      info: [".org-top-card-summary-info-list", ".org-top-card-summary__info-item"],
      overview: ["section.org-about-module__margin-bottom p.break-words", "section p.break-words"],
      details: ["dl"],
    },
    limit: 1,
  } satisfies ExtractSpec,

  personResult: {
    container: RESULT_CONTAINERS,
    fields: {
      name: [
        "span.entity-result__title-text a span[aria-hidden='true']",
        ".entity-result__title-text a",
        "a[href*='/in/'] span[aria-hidden='true']",
      ],
      headline: [".entity-result__primary-subtitle"],
      location: [".entity-result__secondary-subtitle"],
      degree: [".entity-result__badge-text span[aria-hidden='true']", ".entity-result__badge-text"],
    },
    attrs: {
      link: { css: ["span.entity-result__title-text a", "a[href*='/in/']"], attr: "href" },
    },
  } satisfies ExtractSpec,

  companyResult: {
    container: RESULT_CONTAINERS,
    fields: {
      name: [
        "span.entity-result__title-text a",
        ".entity-result__title-text",
        "a[href*='/company/'] span[aria-hidden='true']",
      ],
      subtitle: [".entity-result__primary-subtitle"],
      followers: [".entity-result__secondary-subtitle"],
    },
    attrs: {
      link: { css: ["span.entity-result__title-text a", "a[href*='/company/']"], attr: "href" },
    },
  } satisfies ExtractSpec,

  notification: {
    container: ["article.nt-card", "div.nt-card", "div[data-finite-scroll-hotkey-item]"],
    fields: {
      text: [".nt-card__headline", ".nt-card__text--3-line", ".nt-card__text"],
      time: [".nt-card__time-ago", "time"],
    },
    attrs: {
      link: { css: ["a.nt-card__headline", "a[href*='linkedin.com']", "a[href]"], attr: "href" },
      cls: { css: [":scope"], attr: "class" },
    },
  } satisfies ExtractSpec,

  conversation: {
    container: [
      "li.msg-conversation-listitem",
      "li.msg-conversations-container__convo-item",
      "ul.msg-conversations-container__conversations-list > li",
    ],
    fields: {
      name: [".msg-conversation-listitem__participant-names", ".msg-conversation-card__participant-names", "h3"],
      snippet: [".msg-conversation-card__message-snippet", ".msg-conversation-card__message-snippet-body"],
      time: ["time.msg-conversation-listitem__time-stamp", "time"],
    },
    attrs: {
      link: { css: ["a.msg-conversation-listitem__link", "a[href*='/messaging/thread/']"], attr: "href" },
      cls: { css: [".msg-conversation-card", ":scope"], attr: "class" },
    },
  } satisfies ExtractSpec,

  message: {
    container: ["li.msg-s-message-list__event", "ul.msg-s-message-list-content > li"],
    fields: {
      sender: [".msg-s-message-group__name", ".msg-s-message-group__profile-link"],
      time: ["time.msg-s-message-group__timestamp", ".msg-s-message-list__time-heading", "time"],
      text: [".msg-s-event-listitem__body", "p.msg-s-event-listitem__body"],
    },
  } satisfies ExtractSpec,

  invitation: {
    container: [
      "li.invitation-card",
      "div.invitation-card",
      "section.mn-invitation-manager__invitations li",
      "div[data-view-name='pending-invitation']",
    ],
    fields: {
      name: [".invitation-card__title", "span.invitation-card__title", "strong"],
      headline: [".invitation-card__subtitle"],
      time: [".time-badge", ".invitation-card__time", "time"],
      note: [".invitation-card__custom-message", ".invitation-card__custom-message-container"],
    },
    attrs: {
      link: { css: ["a.invitation-card__link", "a[href*='/in/']"], attr: "href" },
    },
  } satisfies ExtractSpec,

  scheduledPost: {
    container: [
      "div[role='dialog'] li.share-box-scheduled-posts__post",
      "div[role='dialog'] div.scheduled-post",
      "div[role='dialog'] ul > li",
    ],
  } satisfies ExtractSpec,

  page: { container: ["main", "body"], limit: 1 } satisfies ExtractSpec,
} as const;

// ---------------------------------------------------------------------------
// Lists, feed fallbacks, activity and jobs
// ---------------------------------------------------------------------------

export const LIST_SEL = {
  /** Buttons that replaced infinite scroll on some lists. Anchored so post-level "…more" buttons never match. */
  loadMore: entry(
    "list.loadMore",
    { role: "button", name: /^(show more results|load more( results| posts)?|show more (feed updates|posts|updates)|see more (results|posts))$/i },
    { css: "button.scaffold-finite-scroll__load-button" },
  ),
};

/**
 * The newer feed drops data-urn from post containers, so after the classic
 * containers come structural fallbacks. Each post's own permalink is captured
 * from inside its container, and the :scope attributes tell the parser whether
 * a URN came from the container itself or from something nested in it.
 */
const POST_CONTAINER_FALLBACKS = [
  "div[data-view-name='feed-full-update']",
  "main div[role='article']",
  "main [role='listitem']:has(a[href*='/feed/update/urn:li:'])",
  "main article:has(a[href*='/feed/update/urn:li:'])",
];

const OWN_POST_ATTRS: NonNullable<ExtractSpec["attrs"]> = {
  ...POST_ATTRS,
  postLink: {
    css: [
      "a.update-components-actor__sub-description-link[href*='/feed/update/']",
      ".update-components-actor__sub-description a[href*='/feed/update/']",
      ".update-components-actor a[href*='/feed/update/']",
      "a[href*='/feed/update/urn:li:activity:']",
      "a[href*='/feed/update/urn:li:ugcPost:']",
      "a[href*='/feed/update/urn:li:share:']",
      "a[href*='/posts/']",
    ],
    attr: "href",
  },
  selfUrn: { css: [":scope"], attr: "data-urn" },
  selfId: { css: [":scope"], attr: "data-id" },
};

export const FEED_EXTRACT = {
  post: {
    container: [...POST_CONTAINERS, ...POST_CONTAINER_FALLBACKS],
    fields: POST_FIELDS,
    attrs: OWN_POST_ATTRS,
  } satisfies ExtractSpec,
} as const;

export const ACTIVITY_EXTRACT = {
  /** A person's recent-activity page or a company's posts tab. */
  post: {
    container: [
      ...POST_CONTAINERS,
      "div.profile-creator-shared-feed-update__container",
      "div.occludable-update:has(a[href*='/feed/update/urn:li:'])",
      ...POST_CONTAINER_FALLBACKS,
    ],
    fields: POST_FIELDS,
    attrs: OWN_POST_ATTRS,
  } satisfies ExtractSpec,
} as const;

export const JOB_SEL = {
  /** The scrollable results column on /jobs/search/. Cards below the fold render only once scrolled into view. */
  listPane: entry(
    "jobs.listPane",
    { css: ".jobs-search-results-list" },
    { css: ".scaffold-layout__list > div" },
    { css: ".scaffold-layout__list" },
  ),
  nextPage: entry(
    "jobs.nextPage",
    { role: "button", name: /^(next|view next page)$/i },
    { css: "button.artdeco-pagination__button--next" },
  ),
};

export const JOB_EXTRACT = {
  card: {
    container: [
      "li[data-occludable-job-id]",
      "div.job-card-container[data-job-id]",
      "li.jobs-search-results__list-item",
      "div[data-job-id]",
      "main li:has(a[href*='/jobs/view/'])",
      "div.base-card:has(a[href*='/jobs/view/'])",
    ],
    fields: {
      title: [
        ".job-card-list__title--link strong",
        ".job-card-list__title--link",
        ".job-card-list__title",
        ".job-card-container__link strong",
        ".artdeco-entity-lockup__title",
        ".base-search-card__title",
      ],
      company: [
        ".artdeco-entity-lockup__subtitle",
        ".job-card-container__primary-description",
        ".job-card-container__company-name",
        ".base-search-card__subtitle",
      ],
      location: [
        ".job-card-container__metadata-wrapper li",
        ".job-card-container__metadata-item",
        ".artdeco-entity-lockup__caption",
        ".job-search-card__location",
      ],
      posted: ["time", ".job-card-container__listed-time", ".job-search-card__listdate"],
      footer: [".job-card-container__footer-wrapper", ".job-card-list__footer-wrapper"],
    },
    attrs: {
      occludableId: { css: [":scope"], attr: "data-occludable-job-id" },
      selfJobId: { css: [":scope"], attr: "data-job-id" },
      innerJobId: { css: ["[data-job-id]"], attr: "data-job-id" },
      link: {
        css: ["a.job-card-container__link", "a.job-card-list__title--link", "a.job-card-list__title", "a.base-card__full-link", "a[href*='/jobs/view/']"],
        attr: "href",
      },
    },
  } satisfies ExtractSpec,

  saved: {
    container: [
      "li.reusable-search__result-container:has(a[href*='/jobs/view/'])",
      "div.entity-result:has(a[href*='/jobs/view/'])",
      "div[data-chameleon-result-urn*='jobPosting']",
      "main li:has(a[href*='/jobs/view/'])",
    ],
    fields: {
      title: [".entity-result__title-text a span[aria-hidden='true']", ".entity-result__title-text a", ".entity-result__title-text"],
      company: [".entity-result__primary-subtitle"],
      location: [".entity-result__secondary-subtitle"],
      posted: [".entity-result__simple-insight-text", ".reusable-search-simple-insight__text", "time"],
    },
    attrs: {
      link: { css: [".entity-result__title-text a", "a[href*='/jobs/view/']"], attr: "href" },
    },
  } satisfies ExtractSpec,

  details: {
    container: ["main"],
    fields: {
      title: [
        ".job-details-jobs-unified-top-card__job-title h1",
        ".job-details-jobs-unified-top-card__job-title",
        ".jobs-unified-top-card__job-title",
        ".top-card-layout__title",
        "h1",
      ],
      company: [
        ".job-details-jobs-unified-top-card__company-name a",
        ".job-details-jobs-unified-top-card__company-name",
        ".jobs-unified-top-card__company-name a",
        ".jobs-unified-top-card__company-name",
        ".topcard__org-name-link",
      ],
      primary: [
        ".job-details-jobs-unified-top-card__primary-description-container",
        ".job-details-jobs-unified-top-card__tertiary-description-container",
        ".job-details-jobs-unified-top-card__primary-description",
        ".jobs-unified-top-card__primary-description",
        ".topcard__flavor-row",
      ],
      insights: [
        ".job-details-preferences-and-skills",
        ".job-details-fit-level-preferences",
        ".job-details-jobs-unified-top-card__job-insight",
        ".jobs-unified-top-card__job-insight",
        ".description__job-criteria-list",
      ],
      salary: ["#SALARY", ".jobs-details__salary-main-rail-card", ".salary-main-rail__data-body", ".compensation__salary"],
      apply: [".jobs-apply-button--top-card", ".jobs-s-apply", "button.jobs-apply-button", "a.jobs-apply-button"],
      description: [
        "#job-details",
        ".jobs-description__content",
        ".jobs-description-content__text",
        ".jobs-box__html-content",
        ".show-more-less-html__markup",
        ".description__text",
      ],
    },
    attrs: {
      companyLink: {
        css: [".job-details-jobs-unified-top-card__company-name a", ".jobs-unified-top-card__company-name a", ".topcard__org-name-link", "a[href*='/company/']"],
        attr: "href",
      },
      applyLabel: { css: ["button.jobs-apply-button", "a.jobs-apply-button", ".jobs-s-apply button", ".jobs-s-apply a"], attr: "aria-label" },
      applyLink: { css: ["a.jobs-apply-button[href]", ".jobs-s-apply a[href]", "a[href*='externalApply']", "a.apply-button[href]"], attr: "href" },
    },
    limit: 1,
  } satisfies ExtractSpec,

  /** Present once a job page has rendered enough to read. */
  detailsReady: ["main h1", "#job-details", ".jobs-description__content", ".jobs-unified-top-card", ".job-details-jobs-unified-top-card__job-title"],
} as const;
