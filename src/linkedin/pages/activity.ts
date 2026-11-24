import type { Nav } from "../../browser/session.js";
import { notFound } from "../../errors.js";
import { type ActivityPost, parseActivityPosts } from "../parse/activity.js";
import { postKey } from "../parse/feed.js";
import { ACTIVITY_EXTRACT } from "../selectors.js";
import { BASE, companyPostsUrl, companySlug, personActivityUrl, profileUrl } from "../urls.js";
import { NO_POSTS_TEXT, collectList } from "./listing.js";

const MAX_SCROLLS = 6;

export interface ActivityList {
  posts: ActivityPost[];
  complete: boolean;
  note?: string;
}

/** LinkedIn sends missing profiles and companies to /404/ or …/unavailable/. */
export async function assertPageExists(nav: Nav, what: string, url: string): Promise<void> {
  const now = nav.page.url();
  const title = await nav.page.title().catch(() => "");
  if (/\/(404|unavailable)(\/|\?|$)/i.test(now) || /page not found|page doesn['’]t exist/i.test(title)) {
    throw notFound(what, { url });
  }
}

async function collectActivity(nav: Nav, limit: number): Promise<ActivityList> {
  const r = await collectList(nav, {
    spec: ACTIVITY_EXTRACT.post,
    name: "posts",
    parse: (s) => parseActivityPosts(s, limit),
    key: postKey,
    limit,
    maxRounds: MAX_SCROLLS,
    emptyText: NO_POSTS_TEXT,
  });
  return { posts: r.items, complete: r.complete, ...(r.note ? { note: r.note } : {}) };
}

/** A person's recent posts and reposts, newest first, from their activity page. */
export async function readPersonPosts(nav: Nav, profile: string, limit: number): Promise<{ profile_url: string } & ActivityList> {
  const url = personActivityUrl(profile);
  await nav.goto(url);
  await assertPageExists(nav, "That profile", url);
  return { profile_url: profileUrl(profile), ...(await collectActivity(nav, limit)) };
}

/** A company's recent posts, from its Posts tab. */
export async function readCompanyPosts(nav: Nav, company: string, limit: number): Promise<{ company_url: string } & ActivityList> {
  const url = companyPostsUrl(company);
  await nav.goto(url);
  await assertPageExists(nav, "That company page", url);
  return { company_url: `${BASE}/company/${encodeURIComponent(companySlug(company))}/`, ...(await collectActivity(nav, limit)) };
}
