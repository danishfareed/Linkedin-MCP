import type { Nav } from "../../browser/session.js";
import { extractSnapshots, waitForAny } from "../dom.js";
import { type Post, parsePosts } from "../parse/feed.js";
import { EXTRACT } from "../selectors.js";
import { type DatePosted, searchPostsUrl, urls } from "../urls.js";

const MAX_SCROLLS = 6;

/** Reads posts from the current page, scrolling gently until `limit` are found. */
export async function collectPosts(nav: Nav, limit: number, opts: { includePromoted?: boolean } = {}): Promise<Post[]> {
  await waitForAny(nav.page, EXTRACT.feedPost.container);
  let posts: Post[] = [];
  for (let i = 0; i <= MAX_SCROLLS; i++) {
    posts = parsePosts(await extractSnapshots(nav.page, EXTRACT.feedPost), limit, opts);
    if (posts.length >= limit || i === MAX_SCROLLS) break;
    await nav.pacer.scroll(nav.page, 2);
  }
  return posts;
}

export async function readFeed(nav: Nav, limit: number): Promise<Post[]> {
  await nav.goto(urls.feed(), { waitFor: EXTRACT.feedPost.container });
  return collectPosts(nav, limit);
}

export async function searchPosts(nav: Nav, keywords: string, datePosted: DatePosted | undefined, limit: number): Promise<Post[]> {
  await nav.goto(searchPostsUrl(keywords, datePosted), { waitFor: EXTRACT.feedPost.container });
  return collectPosts(nav, limit);
}

/** Your own recent posts, from your profile's activity page. */
export async function readMyPosts(nav: Nav, publicId: string, limit: number): Promise<Post[]> {
  await nav.goto(urls.myActivity(publicId).replace("/all/", "/shares/"), { waitFor: EXTRACT.feedPost.container });
  return collectPosts(nav, limit, { includePromoted: true });
}
