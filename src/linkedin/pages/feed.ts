import type { Nav } from "../../browser/session.js";
import { type Post, parsePosts, postKey } from "../parse/feed.js";
import { ACTIVITY_EXTRACT, type ExtractSpec, FEED_EXTRACT } from "../selectors.js";
import { type PostSearchOptions, searchPostsUrl, urls } from "../urls.js";
import { NO_POSTS_TEXT, collectList } from "./listing.js";

const MAX_SCROLLS = 6;

/** Posts plus whether the list is complete. When it isn't, `note` says why. */
export interface PostList {
  posts: Post[];
  complete: boolean;
  note?: string;
}

interface CollectPostsOptions {
  /** Plural noun for notes and errors. */
  name: string;
  spec?: ExtractSpec;
  includePromoted?: boolean;
  emptyText?: RegExp;
}

/**
 * Reads posts from the current page, scrolling gently (and clicking "Show more
 * results" where LinkedIn uses a button) until `limit` are found. Doesn't
 * scroll at all when no post container appeared; that is reported instead.
 */
export async function collectPosts(nav: Nav, limit: number, o: CollectPostsOptions): Promise<PostList> {
  const r = await collectList(nav, {
    spec: o.spec ?? FEED_EXTRACT.post,
    name: o.name,
    parse: (s) => parsePosts(s, limit, { includePromoted: o.includePromoted }),
    key: postKey,
    limit,
    maxRounds: MAX_SCROLLS,
    emptyText: o.emptyText,
  });
  return { posts: r.items, complete: r.complete, ...(r.note ? { note: r.note } : {}) };
}

export async function readFeedPosts(nav: Nav, limit: number): Promise<PostList> {
  await nav.goto(urls.feed());
  return collectPosts(nav, limit, { name: "feed posts" });
}

export async function searchPosts(nav: Nav, keywords: string, opts: PostSearchOptions, limit: number): Promise<PostList> {
  await nav.goto(searchPostsUrl(keywords, opts));
  return collectPosts(nav, limit, { name: "matching posts" });
}

/** Your own recent posts, from your profile's activity page. */
export async function readMyPosts(nav: Nav, publicId: string, limit: number): Promise<PostList> {
  await nav.goto(urls.myActivity(publicId).replace("/all/", "/shares/"));
  return collectPosts(nav, limit, { name: "posts", spec: ACTIVITY_EXTRACT.post, includePromoted: true, emptyText: NO_POSTS_TEXT });
}
