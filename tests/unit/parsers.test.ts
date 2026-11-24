import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEMOGRAPHIC_CATEGORIES, POST_METRICS, PROFILE_METRICS, readDemographics, readMetrics } from "../../src/linkedin/parse/analytics.js";
import { parseComments } from "../../src/linkedin/parse/comments.js";
import { parseCompany } from "../../src/linkedin/parse/company.js";
import { parsePost, parsePosts } from "../../src/linkedin/parse/feed.js";
import { parseConversation, parseInvitation, parseMessages, parseNotification } from "../../src/linkedin/parse/inbox.js";
import { parseEntry, parseProfile } from "../../src/linkedin/parse/profile.js";
import { parseCompanyResult, parsePersonResult, parseResults } from "../../src/linkedin/parse/search.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const text = (name: string): string => readFileSync(join(FIXTURES, name), "utf8");

describe("feed parser", () => {
  const snaps = json<Snapshot[]>("feed-posts.json");

  it("reads a post from field selectors", () => {
    const post = parsePost(snaps[0]!);
    expect(post).toMatchObject({
      urn: "urn:li:activity:7260000000000000001",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7260000000000000001/",
      author: {
        name: "Alex Rivera",
        headline: "Founder at Northwind Labs | Writing about B2B growth",
        profile_url: "https://www.linkedin.com/in/alex-rivera-0001/",
      },
      posted: "2d",
      reactions: 248,
      comments: 31,
      reposts: 12,
      promoted: false,
    });
    expect(post.text).toBe("We shipped our first public roadmap today.\nThree things I learned:\n1. Say no early\n2. Write it down\n3. Share it anyway");
  });

  it("falls back to visible text when field selectors miss", () => {
    const post = parsePost(snaps[1]!);
    expect(post.context).toBe("Sam Okafor reposted this");
    expect(post.author.name).toBe("Priya Natarajan");
    expect(post.author.headline).toBe("Head of Design at Bluebird");
    expect(post.author.profile_url).toBe("https://www.linkedin.com/in/priya-n-0002/");
    expect(post.posted).toBe("5h");
    expect(post.text).toBe("Design reviews go better when you show the problem before the solution.");
    expect(post.reactions).toBe(1204);
    expect(post.comments).toBe(87);
    expect(post.reposts).toBe(40);
  });

  it("finds the URN in a /posts/ slug link and parses K counts", () => {
    const post = parsePost(snaps[4]!);
    expect(post.urn).toBe("urn:li:activity:7260000000000000004");
    expect(post.author.name).toBe("Jordan Lee");
    expect(post.comments).toBe(210);
    expect(post.text).toBe("Hiring two backend engineers in Lisbon. DM me.");
  });

  it("drops promoted posts and duplicates, and respects the limit", () => {
    const posts = parsePosts(snaps, 10);
    expect(posts.map((p) => p.urn)).toEqual([
      "urn:li:activity:7260000000000000001",
      "urn:li:activity:7260000000000000002",
      "urn:li:activity:7260000000000000004",
    ]);
    expect(parsePosts(snaps, 1)).toHaveLength(1);
    expect(parsePosts(snaps, 10, { includePromoted: true }).some((p) => p.promoted)).toBe(true);
  });
});

describe("comments parser", () => {
  const comments = parseComments(json<Snapshot[]>("comments.json"), 50);

  it("reads top-level comments with id, author and reactions", () => {
    expect(comments[0]).toMatchObject({
      id: "urn:li:comment:(activity:7260000000000000001,7260000000000000101)",
      author: { name: "Maria Gomez", headline: "Product Lead at Tailspin", profile_url: "https://www.linkedin.com/in/maria-gomez-0101/" },
      text: "This is the kind of transparency more teams need.",
      posted: "1d",
      reactions: 14,
      is_reply: false,
    });
  });

  it("reads replies from text alone and marks them", () => {
    expect(comments[1]).toMatchObject({
      author: { name: "Alex Rivera", headline: "Founder at Northwind Labs | Writing about B2B growth" },
      text: "Thanks Maria! Writing it down was the hardest part.",
      posted: "20h",
      is_reply: true,
    });
  });
});

describe("profile parser", () => {
  const { top, sections } = json<{ top: Snapshot; sections: Snapshot[] }>("profile.json");

  it("reads the top card and requested sections only", () => {
    const p = parseProfile(top, sections, ["about", "experience"], "https://www.linkedin.com/in/taylor-brooks/");
    expect(p).toMatchObject({
      name: "Taylor Brooks",
      headline: "VP Marketing at Litware | Ex-Adventure Works",
      location: "Manchester, England, United Kingdom",
      connections: "500+",
      followers: 4812,
      about: "I help B2B teams turn product launches into pipeline.\nPreviously led growth at Adventure Works.",
    });
    expect(p.education).toBeUndefined();
    expect(p.experience).toHaveLength(2);
    expect(p.experience![0]).toMatchObject({
      title: "VP Marketing",
      subtitle: "Litware · Full-time",
      dates: "Mar 2022 - Present · 2 yrs 9 mos",
      location: "Manchester, England, United Kingdom · Hybrid",
      description: "Built the demand-gen team from 2 to 11.",
    });
    expect(p.experience![1]).toMatchObject({ title: "Head of Growth", subtitle: "Adventure Works", dates: "2018 - 2022 · 4 yrs" });
  });

  it("reads education and skills", () => {
    const p = parseProfile(top, sections, ["education", "skills"], null);
    expect(p.education![0]).toMatchObject({ title: "University of Leeds", subtitle: "BA, Economics", dates: "2011 - 2014" });
    expect(p.skills).toEqual(["Demand Generation", "Positioning"]);
  });

  it("returns empty lists for sections the profile does not have", () => {
    const p = parseProfile(top, sections, ["certifications"], null);
    expect(p.certifications).toEqual([]);
  });

  it("parses a single entry", () => {
    expect(parseEntry("Volunteer\nCode Club\nJan 2020 - Dec 2021")).toMatchObject({ title: "Volunteer", subtitle: "Code Club", dates: "Jan 2020 - Dec 2021" });
  });
});

describe("company parser", () => {
  it("reads the about page", () => {
    const c = parseCompany(json<Snapshot>("company-about.json"), "https://www.linkedin.com/company/northwind-labs/");
    expect(c).toEqual({
      name: "Northwind Labs",
      tagline: "Tools for teams that ship weekly",
      overview: "Northwind Labs builds release-planning software for product teams.",
      website: "https://northwind.example",
      industry: "Software Development",
      company_size: "51-200 employees",
      headquarters: "London, England",
      founded: "2016",
      specialties: "Release planning, Roadmaps, Product ops",
      followers: 18000,
      url: "https://www.linkedin.com/company/northwind-labs/",
    });
  });
});

describe("search parsers", () => {
  it("reads people results and skips members without a profile link", () => {
    const people = parseResults(json<Snapshot[]>("search-people.json"), parsePersonResult, 10);
    expect(people).toEqual([
      { name: "Chris Park", headline: "Data Engineer at Proseware", location: "Seattle, WA", profile_url: "https://www.linkedin.com/in/chris-park-0201/", degree: "2nd" },
      { name: "Dana Whitfield", headline: "Staff Engineer, Platform", location: "Austin, Texas", profile_url: "https://www.linkedin.com/in/dana-whitfield-0202/", degree: "3rd+" },
    ]);
  });

  it("reads company results", () => {
    const companies = parseResults(json<Snapshot[]>("search-companies.json"), parseCompanyResult, 10);
    expect(companies).toEqual([
      { name: "Northwind Labs", subtitle: "Software Development • London", followers: 18000, url: "https://www.linkedin.com/company/northwind-labs/" },
      { name: "Bluebird Studio", subtitle: "Design Services • Berlin", followers: 2310, url: "https://www.linkedin.com/company/bluebird-studio/" },
    ]);
  });
});

describe("notifications, inbox and invitations parsers", () => {
  it("reads notifications", () => {
    const [a, b] = json<Snapshot[]>("notifications.json").map(parseNotification);
    expect(a).toEqual({
      text: "Maria Gomez commented on your post: This is the kind of transparency more teams need.",
      time: "1d",
      url: "https://www.linkedin.com/feed/update/urn:li:activity:7260000000000000001/",
      unread: true,
    });
    expect(b).toMatchObject({ text: "Your post has 1,000 impressions so far. See who engaged. View analytics", time: "3d", unread: false });
  });

  it("reads conversations and messages", () => {
    const inbox = json<{ conversations: Snapshot[]; messages: Snapshot[] }>("inbox.json");
    const [c1, c2] = inbox.conversations.map(parseConversation);
    expect(c1).toEqual({ name: "Chris Park", snippet: "Chris: Thanks, happy to chat next week", time: "Nov 21", unread: true, thread_url: "https://www.linkedin.com/messaging/thread/2-AbCdEf==/" });
    expect(c2).toMatchObject({ name: "Priya Natarajan", time: "10:42 AM", snippet: "You: Sounds good!", unread: false, thread_url: "https://www.linkedin.com/messaging/thread/2-XyZ123==/" });

    expect(parseMessages(inbox.messages, 50)).toEqual([
      { sender: "Chris Park", time: "9:58 AM", text: "Hi! Loved your post on roadmaps." },
      { sender: "Chris Park", time: "9:58 AM", text: "Would you be open to a quick call?" },
      { sender: "You", time: "10:15 AM", text: "Sure, next Tuesday works." },
    ]);
    expect(parseMessages(inbox.messages, 1)).toHaveLength(1);
  });

  it("reads invitations with a usable id", () => {
    const [a, b] = json<Snapshot[]>("invitations.json").map(parseInvitation);
    expect(a).toEqual({
      id: "riley-chen-0301",
      name: "Riley Chen",
      headline: "Growth Marketer at Wingtip",
      profile_url: "https://www.linkedin.com/in/riley-chen-0301/",
      time: "2 days ago",
      note: "Hi! Enjoyed your talk at the meetup.",
    });
    expect(b).toMatchObject({ id: "morgan-hale-0302", name: "Morgan Hale", headline: "Founder, Hale & Co", time: "Yesterday" });
  });
});

describe("analytics parsers", () => {
  it("reads dashboard metrics where the number sits above the label", () => {
    const m = readMetrics(text("dashboard.txt"), PROFILE_METRICS);
    expect(m["Post impressions"]).toEqual({ value: 12480, change: "18.2% past 7 days" });
    expect(m.Followers).toEqual({ value: 4812, change: "1.1% past 7 days" });
    expect(m["Profile viewers"]?.value).toBe(356);
    expect(m["Search appearances"]?.value).toBe(1029);
  });

  it("reads post metrics where the number sits below the label", () => {
    const m = readMetrics(text("post-analytics.txt"), POST_METRICS);
    expect(m.Impressions?.value).toBe(8934);
    expect(m["Members reached"]?.value).toBe(5210);
    expect(m["Profile viewers from this post"]?.value).toBe(112);
    expect(m["Followers gained from this post"]?.value).toBe(27);
    expect(m.Reactions?.value).toBe(248);
    expect(m["Sends on LinkedIn"]?.value).toBe(6);
  });

  it("reads demographics", () => {
    const d = readDemographics(text("post-analytics.txt"), DEMOGRAPHIC_CATEGORIES);
    expect(d).toEqual([
      { category: "Job titles", items: [{ label: "Product Manager", share: "14%" }, { label: "Software Engineer", share: "9.5%" }, { label: "Founder", share: "6%" }] },
      { category: "Locations", items: [{ label: "Greater London", share: "22%" }, { label: "New York City Metropolitan Area", share: "8%" }] },
      { category: "Industries", items: [{ label: "Software Development", share: "31%" }] },
    ]);
  });
});
