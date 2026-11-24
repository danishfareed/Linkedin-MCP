import { invalidInput } from "../errors.js";

export const BASE = "https://www.linkedin.com";

const ACTIVITY_RE = /urn:li:(?:activity|share|ugcPost):(\d{8,25})/i;
const POST_SLUG_RE = /-(?:activity|share|ugcPost)-(\d{8,25})-/i;

/** Accepts a post URL, a /posts/ slug URL or a bare URN; returns the activity URN. */
export function activityUrn(input: string): string {
  const s = decodeURIComponent(input.trim());
  const urn = ACTIVITY_RE.exec(s);
  if (urn) {
    const kind = /urn:li:(activity|share|ugcPost)/i.exec(s)![1]!;
    return `urn:li:${kind === "activity" ? "activity" : kind}:${urn[1]}`;
  }
  const slug = POST_SLUG_RE.exec(s);
  if (slug) return `urn:li:activity:${slug[1]}`;
  if (/^\d{15,25}$/.test(s)) return `urn:li:activity:${s}`;
  throw invalidInput(
    `"${input}" is not a LinkedIn post URL. Use a link like https://www.linkedin.com/feed/update/urn:li:activity:1234567890123456789/`,
  );
}

export function postUrl(input: string): string {
  return `${BASE}/feed/update/${activityUrn(input)}/`;
}

export function postAnalyticsUrl(input: string): string {
  return `${BASE}/analytics/post-summary/${activityUrn(input)}/`;
}

const PROFILE_RE = /linkedin\.com\/in\/([^/?#]+)/i;
const USERNAME_RE = /^[a-z0-9][a-z0-9\-_%.]{1,100}$/i;

/** Returns the public identifier ("jane-doe-123") from a URL or a bare username. */
export function profileId(input: string): string {
  const s = input.trim().replace(/^@/, "");
  const m = PROFILE_RE.exec(s);
  const id = m ? m[1]! : s;
  const decoded = decodeURIComponent(id);
  if (!USERNAME_RE.test(id) || decoded.includes("/")) {
    throw invalidInput(`"${input}" is not a LinkedIn profile URL or username. Use https://www.linkedin.com/in/username/ or just the username.`);
  }
  return decoded;
}

export function profileUrl(input: string): string {
  return `${BASE}/in/${encodeURIComponent(profileId(input))}/`;
}

const COMPANY_RE = /linkedin\.com\/(?:company|school|showcase)\/([^/?#]+)/i;

export function companySlug(input: string): string {
  const s = input.trim();
  const m = COMPANY_RE.exec(s);
  const slug = m ? m[1]! : s;
  if (!/^[a-z0-9][a-z0-9\-_%.]{0,100}$/i.test(slug)) {
    throw invalidInput(`"${input}" is not a LinkedIn company URL or slug. Use https://www.linkedin.com/company/slug/ or just the slug.`);
  }
  return decodeURIComponent(slug);
}

export function companyAboutUrl(input: string): string {
  return `${BASE}/company/${encodeURIComponent(companySlug(input))}/about/`;
}

/** A company's posts tab. */
export function companyPostsUrl(input: string): string {
  return `${BASE}/company/${encodeURIComponent(companySlug(input))}/posts/`;
}

/** A person's recent activity. "all" is the Posts tab (their posts and reposts). */
export function personActivityUrl(input: string, tab: "all" | "shares" = "all"): string {
  return `${BASE}/in/${encodeURIComponent(profileId(input))}/recent-activity/${tab}/`;
}

const LINKEDIN_URL_RE = /^(?:https?:\/\/)?(?:[a-z0-9-]+\.)*linkedin\.com\//i;
const JOB_VIEW_RE = /\/jobs\/view\/(?:[^/?#]*?-)?(\d{6,15})(?=[/?#]|$)/i;
const CURRENT_JOB_RE = /[?&]currentJobId=(\d{6,15})(?=&|#|$)/i;
const JOB_URN_RE = /urn:li:(?:fsd_)?jobPosting:(\d{6,15})/i;

/** Finds a job id in a job link or job URN. Returns null when there is none. */
export function jobIdIn(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = JOB_VIEW_RE.exec(value) ?? CURRENT_JOB_RE.exec(value) ?? JOB_URN_RE.exec(value);
  return m ? m[1]! : null;
}

/** Accepts a job URL (/jobs/view/…, or any jobs page with currentJobId=…), a job URN or a bare numeric id. */
export function jobId(input: string): string {
  const s = input.trim();
  if (/^\d{6,15}$/.test(s)) return s;
  const id = LINKEDIN_URL_RE.test(s) || /^urn:li:/i.test(s) ? jobIdIn(s) : null;
  if (id) return id;
  throw invalidInput(`"${input}" is not a LinkedIn job URL or job id. Use a link like https://www.linkedin.com/jobs/view/1234567890/ or just the number.`);
}

export function jobUrl(input: string): string {
  return `${BASE}/jobs/view/${jobId(input)}/`;
}

const THREAD_RE = /linkedin\.com\/messaging\/thread\/([^/?#]+)/i;

export function threadUrl(input: string): string | null {
  const m = THREAD_RE.exec(input.trim());
  return m ? `${BASE}/messaging/thread/${m[1]}/` : null;
}

export const urls = {
  home: () => `${BASE}/`,
  login: () => `${BASE}/login`,
  feed: () => `${BASE}/feed/`,
  me: () => `${BASE}/in/me/`,
  myActivity: (id: string) => `${BASE}/in/${encodeURIComponent(id)}/recent-activity/all/`,
  notifications: () => `${BASE}/notifications/`,
  messaging: () => `${BASE}/messaging/`,
  invitationsReceived: () => `${BASE}/mynetwork/invitation-manager/received/`,
  invitationsSent: () => `${BASE}/mynetwork/invitation-manager/sent/`,
  dashboard: () => `${BASE}/dashboard/`,
  profileDetails: (id: string, section: string) => `${BASE}/in/${encodeURIComponent(id)}/details/${section}/`,
  savedJobs: () => `${BASE}/my-items/saved-jobs/`,
};

export const DATE_POSTED = ["past-24h", "past-week", "past-month"] as const;
export type DatePosted = (typeof DATE_POSTED)[number];

export const POST_SORTS = ["relevance", "latest"] as const;
export type PostSort = (typeof POST_SORTS)[number];

export const POST_CONTENT_TYPES = ["photos", "videos", "documents"] as const;
export type PostContentType = (typeof POST_CONTENT_TYPES)[number];

export interface PostSearchOptions {
  datePosted?: DatePosted;
  /** "latest" maps to LinkedIn's sortBy="date_posted". */
  sort?: PostSort;
  contentType?: PostContentType;
}

export function searchPostsUrl(keywords: string, opts: PostSearchOptions = {}): string {
  const u = new URL(`${BASE}/search/results/content/`);
  u.searchParams.set("keywords", keywords);
  u.searchParams.set("origin", "FACETED_SEARCH");
  if (opts.datePosted) u.searchParams.set("datePosted", JSON.stringify(opts.datePosted));
  if (opts.sort === "latest") u.searchParams.set("sortBy", JSON.stringify("date_posted"));
  if (opts.contentType) u.searchParams.set("contentType", JSON.stringify(opts.contentType));
  return u.toString();
}

export const WORKPLACE_TYPES = ["on-site", "remote", "hybrid"] as const;
export type WorkplaceType = (typeof WORKPLACE_TYPES)[number];

export const EXPERIENCE_LEVELS = ["internship", "entry", "associate", "mid-senior", "director", "executive"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

/** LinkedIn's job search filter codes. */
export const JOB_FILTER_CODES = {
  datePosted: { "past-24h": "r86400", "past-week": "r604800", "past-month": "r2592000" } satisfies Record<DatePosted, string>,
  workplace: { "on-site": "1", remote: "2", hybrid: "3" } satisfies Record<WorkplaceType, string>,
  experience: { internship: "1", entry: "2", associate: "3", "mid-senior": "4", director: "5", executive: "6" } satisfies Record<ExperienceLevel, string>,
};

export interface JobSearchFilters {
  keywords: string;
  location?: string;
  datePosted?: DatePosted;
  workplace?: readonly WorkplaceType[];
  experience?: readonly ExperienceLevel[];
  easyApplyOnly?: boolean;
}

function codeList<K extends string>(values: readonly K[] | undefined, codes: Record<K, string>): string | null {
  if (!values?.length) return null;
  return [...new Set(values.map((v) => codes[v]))].sort().join(",");
}

export function searchJobsUrl(f: JobSearchFilters): string {
  const u = new URL(`${BASE}/jobs/search/`);
  u.searchParams.set("keywords", f.keywords);
  if (f.location?.trim()) u.searchParams.set("location", f.location.trim());
  if (f.datePosted) u.searchParams.set("f_TPR", JOB_FILTER_CODES.datePosted[f.datePosted]);
  const workplace = codeList(f.workplace, JOB_FILTER_CODES.workplace);
  if (workplace) u.searchParams.set("f_WT", workplace);
  const experience = codeList(f.experience, JOB_FILTER_CODES.experience);
  if (experience) u.searchParams.set("f_E", experience);
  if (f.easyApplyOnly) u.searchParams.set("f_AL", "true");
  return u.toString();
}

export interface PeopleFilters {
  network?: ("1st" | "2nd" | "3rd+")[];
  title?: string;
  company?: string;
  first_name?: string;
  last_name?: string;
  school?: string;
}

const NETWORK_CODES = { "1st": "F", "2nd": "S", "3rd+": "O" } as const;

export function searchPeopleUrl(keywords: string, filters: PeopleFilters = {}): string {
  const u = new URL(`${BASE}/search/results/people/`);
  if (keywords) u.searchParams.set("keywords", keywords);
  u.searchParams.set("origin", "FACETED_SEARCH");
  if (filters.network?.length) {
    u.searchParams.set("network", JSON.stringify(filters.network.map((n) => NETWORK_CODES[n])));
  }
  if (filters.title) u.searchParams.set("titleFreeText", filters.title);
  if (filters.company) u.searchParams.set("company", filters.company);
  if (filters.first_name) u.searchParams.set("firstName", filters.first_name);
  if (filters.last_name) u.searchParams.set("lastName", filters.last_name);
  if (filters.school) u.searchParams.set("schoolFreetext", filters.school);
  return u.toString();
}

export function searchCompaniesUrl(keywords: string): string {
  const u = new URL(`${BASE}/search/results/companies/`);
  u.searchParams.set("keywords", keywords);
  u.searchParams.set("origin", "SWITCH_SEARCH_VERTICAL");
  return u.toString();
}

/** Strip tracking parameters and normalise LinkedIn links. */
export function cleanLink(href: string | null | undefined): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, BASE);
  } catch {
    return null;
  }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return u.toString();
  const profile = /^\/in\/([^/]+)/.exec(u.pathname);
  if (profile) return `${BASE}/in/${profile[1]}/`;
  const company = /^\/(company|school|showcase)\/([^/]+)/.exec(u.pathname);
  if (company) return `${BASE}/${company[1]}/${company[2]}/`;
  const thread = /^\/messaging\/thread\/([^/]+)/.exec(u.pathname);
  if (thread) return `${BASE}/messaging/thread/${thread[1]}/`;
  const job = /^\/jobs\//.test(u.pathname) ? jobIdIn(`${u.pathname}${u.search}`) : null;
  if (job) return `${BASE}/jobs/view/${job}/`;
  let path = u.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  const urn = /urn:li:(activity|share|ugcPost):(\d{8,25})/i.exec(path);
  if (urn) return `${BASE}/feed/update/urn:li:${urn[1]}:${urn[2]}/`;
  return `${BASE}${u.pathname}`;
}
