import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Pacer } from "../../src/browser/human.js";
import type { Nav } from "../../src/browser/session.js";
import { LinkedInMcpError } from "../../src/errors.js";
import { type CollectOptions, collectList, listOf } from "../../src/linkedin/pages/listing.js";
import { parsePosts, postKey, postUrnIn } from "../../src/linkedin/parse/feed.js";
import type { ExtractSpec } from "../../src/linkedin/selectors.js";
import { type Snapshot, emptySnapshot } from "../../src/linkedin/snapshot.js";
import { cleanLink, searchPostsUrl } from "../../src/linkedin/urls.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

describe("feed parser on the newer layout (no data-urn on containers)", () => {
  const posts = parsePosts(json<Snapshot[]>("feed-new-layout.json"), 20);

  it("pairs every post with its own permalink", () => {
    expect(posts.map((p) => [p.author.name, p.url])).toEqual([
      ["Alex Rivera", "https://www.linkedin.com/feed/update/urn:li:activity:7263000000000000001/"],
      ["Priya Natarajan", "https://www.linkedin.com/feed/update/urn:li:activity:7263000000000000002/"],
      ["Jordan Lee", null],
      ["Maria Gomez", "https://www.linkedin.com/feed/update/urn:li:ugcPost:7262900000000000004/"],
    ]);
  });

  it("keeps a post whose only link points at another post, without that post's URL", () => {
    expect(posts[2]).toMatchObject({ urn: null, url: null, text: "Agree with Alex here, and we did the same last year.", reactions: 31, comments: 2 });
  });

  it("reads authors and counts from the text fallback", () => {
    expect(posts[0]).toMatchObject({
      author: { name: "Alex Rivera", headline: "Founder at Northwind Labs", profile_url: "https://www.linkedin.com/in/alex-rivera-0001/" },
      posted: "5h",
      reactions: 142,
      comments: 18,
      reposts: 6,
    });
    expect(posts[3]).toMatchObject({ reactions: 1310, comments: 96, reposts: 48 });
  });

  it("finds post URNs in links, slugs and data attributes", () => {
    expect(postUrnIn("https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A7262900000000000004/")).toBe("urn:li:ugcPost:7262900000000000004");
    expect(postUrnIn("https://www.linkedin.com/posts/jane_topic-share-7262900000000000005-AbCd")).toBe("urn:li:share:7262900000000000005");
    expect(postUrnIn("urn:li:aggregate:(urn:li:activity:1,2)")).toBeNull();
    expect(postUrnIn("%E0%A4%A")).toBeNull();
    expect(postKey(posts[2]!)).toBe("Jordan Lee|Agree with Alex here, and we did the same last year.");
  });
});

describe("post search and link URLs", () => {
  it("adds sort and content type to post searches", () => {
    const u = new URL(searchPostsUrl("mcp server", { datePosted: "past-month", sort: "latest", contentType: "videos" }));
    expect(u.searchParams.get("datePosted")).toBe('"past-month"');
    expect(u.searchParams.get("sortBy")).toBe('"date_posted"');
    expect(u.searchParams.get("contentType")).toBe('"videos"');
    const relevance = new URL(searchPostsUrl("mcp server", { sort: "relevance" }));
    expect(relevance.searchParams.get("sortBy")).toBeNull();
    expect(relevance.searchParams.get("contentType")).toBeNull();
  });

  it("keeps the post type when cleaning post links", () => {
    expect(cleanLink("https://www.linkedin.com/feed/update/urn:li:ugcPost:7262900000000000004/?x=1")).toBe("https://www.linkedin.com/feed/update/urn:li:ugcPost:7262900000000000004/");
    expect(cleanLink("https://www.linkedin.com/feed/update/urn:li:activity:7262900000000000004/")).toBe("https://www.linkedin.com/feed/update/urn:li:activity:7262900000000000004/");
  });
});

// --- collectList against a fake page -----------------------------------------

interface FakeOptions {
  /** Snapshots visible after 0, 1, 2… scrolls or clicks. The last entry repeats. */
  rounds?: Snapshot[][];
  /** innerText of <main>, used when no container appears. */
  mainText?: string;
  /** Show a "Show more results" button from this round on. */
  loadMoreFrom?: number;
}

function fakeNav(o: FakeOptions) {
  const rounds = o.rounds ?? [];
  const stats = { round: 0, wheels: 0, clicks: 0, extracts: 0 };
  let moved = false;
  const buttonVisible = () => o.loadMoreFrom !== undefined && stats.round >= o.loadMoreFrom;
  const locator = () => ({
    count: async () => (buttonVisible() ? 1 : 0),
    nth: () => ({
      isVisible: async () => buttonVisible(),
      click: async () => {
        stats.clicks++;
        moved = true;
      },
    }),
  });
  const page = {
    waitForSelector: async () => {
      if (!rounds.length) throw new Error("Timeout 15000ms exceeded");
    },
    evaluate: async (script: string) => {
      if (!script.includes("pickAll")) return o.mainText ?? "";
      if (moved) {
        stats.round++;
        moved = false;
      }
      stats.extracts++;
      return rounds[Math.min(stats.round, rounds.length - 1)];
    },
    url: () => "https://www.linkedin.com/feed/",
    mouse: {
      wheel: async () => {
        stats.wheels++;
        moved = true;
      },
    },
    getByRole: locator,
    getByLabel: locator,
    getByPlaceholder: locator,
    getByText: locator,
    locator,
  };
  const nav = { page, pacer: new Pacer(async () => undefined, () => 0.5) } as unknown as Nav;
  return { nav, stats };
}

const SPEC: ExtractSpec = { container: ["div.item"] };
const snap = (text: string): Snapshot => emptySnapshot({ text });
const opts = (over: Partial<CollectOptions<string>> = {}): CollectOptions<string> => ({
  spec: SPEC,
  name: "things",
  parse: (s) => s.map((x) => x.text).filter(Boolean),
  key: (t) => t,
  limit: 3,
  maxRounds: 6,
  ...over,
});

describe("collectList", () => {
  it("returns an empty, complete list for LinkedIn's own empty state without scrolling", async () => {
    const { nav, stats } = fakeNav({ mainText: "No results found. Try different keywords." });
    const r = await collectList(nav, opts());
    expect(r).toEqual({ items: [], complete: true, note: "LinkedIn shows no things here." });
    expect(stats.wheels).toBe(0);
  });

  it("accepts page-specific empty-state wording", async () => {
    const { nav } = fakeNav({ mainText: "Jane hasn’t posted yet. Posts Jane shares will appear here, along with lots of other filler text on the page." });
    expect((await collectList(nav, opts({ emptyText: /hasn['’]t posted/ }))).items).toEqual([]);
  });

  it("throws SELECTOR_BROKEN instead of returning [] when the page has content but no list items", async () => {
    const { nav, stats } = fakeNav({ mainText: "Welcome back! ".repeat(20) });
    const err = await collectList(nav, opts()).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LinkedInMcpError);
    expect((err as LinkedInMcpError).code).toBe("SELECTOR_BROKEN");
    expect(stats.wheels).toBe(0);
  });

  it("throws TIMEOUT when the page is blank", async () => {
    const { nav } = fakeNav({ mainText: "" });
    expect(((await collectList(nav, opts()).catch((e: unknown) => e)) as LinkedInMcpError).code).toBe("TIMEOUT");
  });

  it("stops as soon as it has enough", async () => {
    const { nav, stats } = fakeNav({ rounds: [[snap("a"), snap("b"), snap("c"), snap("d")]] });
    expect(await collectList(nav, opts())).toEqual({ items: ["a", "b", "c"], complete: true });
    expect(stats.wheels).toBe(0);
  });

  it("scrolls until the limit is reached", async () => {
    const { nav } = fakeNav({ rounds: [[snap("a")], [snap("a"), snap("b")], [snap("a"), snap("b"), snap("c")]] });
    expect(await collectList(nav, opts())).toEqual({ items: ["a", "b", "c"], complete: true });
  });

  it("merges rounds when LinkedIn unloads items that scrolled away", async () => {
    const { nav } = fakeNav({ rounds: [[snap("a"), snap("b")], [snap("c"), snap("d")]] });
    expect((await collectList(nav, opts({ limit: 4 }))).items).toEqual(["a", "b", "c", "d"]);
  });

  it("reports a partial list when LinkedIn stops loading more", async () => {
    const { nav, stats } = fakeNav({ rounds: [[snap("a")], [snap("a"), snap("b")]] });
    const r = await collectList(nav, opts({ limit: 5 }));
    expect(r.items).toEqual(["a", "b"]);
    expect(r.complete).toBe(false);
    expect(r.note).toMatch(/stopped loading more things after 2 \(5 requested\)/);
    expect(stats.extracts).toBe(4); // first read, one that added, two that added nothing
  });

  it("reports a partial list when the scroll budget runs out", async () => {
    const rounds = [[snap("a")], [snap("a"), snap("b")], [snap("a"), snap("b"), snap("c")]];
    const { nav } = fakeNav({ rounds });
    const r = await collectList(nav, opts({ limit: 10, maxRounds: 2 }));
    expect(r).toMatchObject({ items: ["a", "b", "c"], complete: false });
    expect(r.note).toMatch(/Stopped after 2 scrolls with 3 of the 10 things requested/);
  });

  it("says so when list items appear but none can be read", async () => {
    const { nav } = fakeNav({ rounds: [[snap(""), snap("")]] });
    const r = await collectList(nav, opts());
    expect(r).toMatchObject({ items: [], complete: false });
    expect(r.note).toMatch(/showed 2 list items but none could be read as things/);
  });

  it("clicks Show more results when LinkedIn uses a button instead of infinite scroll", async () => {
    const { nav, stats } = fakeNav({ rounds: [[snap("a")], [snap("a")], [snap("a"), snap("b"), snap("c")]], loadMoreFrom: 0 });
    const r = await collectList(nav, opts());
    expect(r.complete).toBe(true);
    expect(stats.clicks).toBeGreaterThan(0);
  });

  it("can skip the load-more button and use a custom scroll", async () => {
    let custom = 0;
    const { nav, stats } = fakeNav({ rounds: [[snap("a")], [snap("a"), snap("b"), snap("c")]], loadMoreFrom: 0 });
    const r = await collectList(nav, opts({ loadMore: false, scroll: async (n) => { custom++; await n.page.mouse.wheel(0, 500); } }));
    expect(r.complete).toBe(true);
    expect(custom).toBe(1);
    expect(stats.clicks).toBe(0);
  });

  it("spreads a list into a tool result", () => {
    expect(listOf("posts", { items: [1], complete: true })).toEqual({ posts: [1], complete: true });
    expect(listOf("jobs", { items: [], complete: false, note: "n" })).toEqual({ jobs: [], complete: false, note: "n" });
  });
});
