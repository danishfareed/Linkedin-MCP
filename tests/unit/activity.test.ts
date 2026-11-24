import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activityKind, parseActivityPosts } from "../../src/linkedin/parse/activity.js";
import { parsePost } from "../../src/linkedin/parse/feed.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";
import { companyPostsUrl, personActivityUrl } from "../../src/linkedin/urls.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

describe("person posts parser", () => {
  const snaps = json<Snapshot[]>("person-activity.json");
  const posts = parseActivityPosts(snaps, 20);

  it("keeps posts and reposts, drops comments and duplicates", () => {
    expect(posts.map((p) => [p.kind, p.url])).toEqual([
      ["post", "https://www.linkedin.com/feed/update/urn:li:activity:7261000000000000001/"],
      ["repost", "https://www.linkedin.com/feed/update/urn:li:share:7261000000000000002/"],
      ["post", "https://www.linkedin.com/feed/update/urn:li:activity:7260500000000000004/"],
    ]);
  });

  it("reads text, relative date and counts", () => {
    expect(posts[0]).toMatchObject({
      author: { name: "Jane Doe", headline: "VP Engineering at Northwind Labs", profile_url: "https://www.linkedin.com/in/jane-doe-0042/" },
      posted: "3d",
      text: "We just open-sourced our internal feature-flag service.\nIt took two years to get here.",
      reactions: 412,
      comments: 38,
      reposts: 9,
    });
  });

  it("pairs a repost with its own permalink, not the reshared post's nested URN", () => {
    expect(posts[1]).toMatchObject({
      urn: "urn:li:share:7261000000000000002",
      context: "Jane Doe reposted this",
      author: { name: "Sam Okafor", profile_url: "https://www.linkedin.com/in/sam-okafor-0007/" },
      posted: "1w",
      text: "Hiring is a product problem, not a process problem.",
      reactions: 1024,
      comments: 77,
      reposts: 15,
    });
  });

  it("prefers the timestamp link over a link to another post in the text", () => {
    expect(posts[2]).toMatchObject({ urn: "urn:li:activity:7260500000000000004", posted: "2w", reactions: 230, comments: 19, reposts: 4 });
  });

  it("respects the limit", () => {
    expect(parseActivityPosts(snaps, 1)).toHaveLength(1);
  });

  it("classifies activity headers", () => {
    const kind = (header: string | null) => activityKind({ ...parsePost(snaps[0]!), context: header });
    expect(kind(null)).toBe("post");
    expect(kind("Jane Doe reposted this")).toBe("repost");
    expect(kind("Jane Doe commented on this")).toBe("comment");
    expect(kind("Jane Doe likes this")).toBe("reaction");
    expect(kind("Jane Doe finds this insightful")).toBe("reaction");
    expect(kind("Jane Doe is celebrating 5 years at Northwind")).toBe("other");
  });
});

describe("company posts parser", () => {
  const posts = parseActivityPosts(json<Snapshot[]>("company-posts.json"), 20);

  it("reads company posts, skipping containers LinkedIn hasn't rendered", () => {
    expect(posts.map((p) => p.urn)).toEqual([
      "urn:li:ugcPost:7262000000000000010",
      "urn:li:ugcPost:7261900000000000011",
      "urn:li:activity:7261800000000000012",
    ]);
  });

  it("keeps ugcPost URNs in post URLs", () => {
    expect(posts[0]).toMatchObject({
      url: "https://www.linkedin.com/feed/update/urn:li:ugcPost:7262000000000000010/",
      author: { name: "Northwind Labs", profile_url: "https://www.linkedin.com/company/northwind-labs/" },
      posted: "4d",
      text: "We're hiring in Lisbon! Five engineering roles are open.",
      reactions: 356,
      comments: 41,
      reposts: 22,
      kind: "post",
    });
  });

  it("reads a /posts/ slug and K counts from the text fallback", () => {
    expect(posts[1]).toMatchObject({
      url: "https://www.linkedin.com/feed/update/urn:li:ugcPost:7261900000000000011/",
      author: { name: "Northwind Labs" },
      posted: "1w",
      text: "Our Q3 product update is live.",
      reactions: 1200,
      comments: 64,
      reposts: 31,
    });
  });

  it("marks the company's reposts", () => {
    expect(posts[2]).toMatchObject({ kind: "repost", author: { name: "Alex Rivera" }, text: "Proud of this team." });
  });
});

describe("activity URLs", () => {
  it("builds person activity and company posts URLs", () => {
    expect(personActivityUrl("https://www.linkedin.com/in/jane-doe-0042/?originalSubdomain=pt")).toBe("https://www.linkedin.com/in/jane-doe-0042/recent-activity/all/");
    expect(personActivityUrl("jane-doe-0042", "shares")).toBe("https://www.linkedin.com/in/jane-doe-0042/recent-activity/shares/");
    expect(companyPostsUrl("https://www.linkedin.com/company/northwind-labs/about/")).toBe("https://www.linkedin.com/company/northwind-labs/posts/");
    expect(companyPostsUrl("northwind-labs")).toBe("https://www.linkedin.com/company/northwind-labs/posts/");
    expect(() => personActivityUrl("not a profile")).toThrow(/not a LinkedIn profile/);
    expect(() => companyPostsUrl("acme corp!")).toThrow(/not a LinkedIn company/);
  });
});
