import { describe, expect, it } from "vitest";
import { cleanBody, cleanText, countByKeyword, degree, lines, parseCount, relativeTime } from "../../src/linkedin/parse/text.js";
import {
  activityUrn,
  cleanLink,
  companyAboutUrl,
  postAnalyticsUrl,
  postUrl,
  profileId,
  profileUrl,
  searchPeopleUrl,
  searchPostsUrl,
  threadUrl,
} from "../../src/linkedin/urls.js";

describe("urls", () => {
  it("normalises post inputs to an activity URN", () => {
    expect(activityUrn("https://www.linkedin.com/feed/update/urn:li:activity:7260000000000000001/")).toBe("urn:li:activity:7260000000000000001");
    expect(activityUrn("https://www.linkedin.com/posts/jane_topic-activity-7260000000000000002-AbCd?utm_source=share")).toBe("urn:li:activity:7260000000000000002");
    expect(activityUrn("urn:li:activity:7260000000000000003")).toBe("urn:li:activity:7260000000000000003");
    expect(activityUrn("https://www.linkedin.com/feed/update/urn%3Ali%3AugcPost%3A7260000000000000004")).toBe("urn:li:ugcPost:7260000000000000004");
    expect(() => activityUrn("https://example.com/post/1")).toThrow(/not a LinkedIn post URL/);
    expect(postUrl("urn:li:activity:7260000000000000001")).toBe("https://www.linkedin.com/feed/update/urn:li:activity:7260000000000000001/");
    expect(postAnalyticsUrl("urn:li:activity:7260000000000000001")).toBe("https://www.linkedin.com/analytics/post-summary/urn:li:activity:7260000000000000001/");
  });

  it("normalises profiles and companies", () => {
    expect(profileId("https://www.linkedin.com/in/jane-doe-123/?originalSubdomain=uk")).toBe("jane-doe-123");
    expect(profileId("@jane-doe")).toBe("jane-doe");
    expect(profileUrl("jane-doe")).toBe("https://www.linkedin.com/in/jane-doe/");
    expect(() => profileId("not a profile")).toThrow();
    expect(() => profileId("../../etc")).toThrow();
    expect(companyAboutUrl("https://www.linkedin.com/company/northwind-labs/posts/")).toBe("https://www.linkedin.com/company/northwind-labs/about/");
    expect(companyAboutUrl("northwind-labs")).toBe("https://www.linkedin.com/company/northwind-labs/about/");
  });

  it("recognises thread URLs", () => {
    expect(threadUrl("https://www.linkedin.com/messaging/thread/2-AbC==/?x=1")).toBe("https://www.linkedin.com/messaging/thread/2-AbC==/");
    expect(threadUrl("jane-doe")).toBeNull();
  });

  it("builds search URLs with filters", () => {
    const u = new URL(searchPeopleUrl("growth marketer", { network: ["1st", "2nd"], title: "VP", company: "Litware" }));
    expect(u.pathname).toBe("/search/results/people/");
    expect(u.searchParams.get("keywords")).toBe("growth marketer");
    expect(u.searchParams.get("network")).toBe('["F","S"]');
    expect(u.searchParams.get("titleFreeText")).toBe("VP");
    expect(u.searchParams.get("company")).toBe("Litware");
    const p = new URL(searchPostsUrl("mcp server", { datePosted: "past-week" }));
    expect(p.searchParams.get("datePosted")).toBe('"past-week"');
    expect(p.searchParams.get("sortBy")).toBeNull();
  });

  it("cleans links", () => {
    expect(cleanLink("https://www.linkedin.com/in/jane?miniProfileUrn=x")).toBe("https://www.linkedin.com/in/jane/");
    expect(cleanLink("/company/acme/life/")).toBe("https://www.linkedin.com/company/acme/");
    expect(cleanLink("https://www.linkedin.com/feed/update/urn:li:activity:1234567890123/?commentUrn=x")).toBe("https://www.linkedin.com/feed/update/urn:li:activity:1234567890123/");
    expect(cleanLink(null)).toBeNull();
  });
});

describe("text helpers", () => {
  it("splits lines and collapses consecutive duplicates", () => {
    expect(lines("Jane\nJane\n  \nFounder\nJane")).toEqual(["Jane", "Founder", "Jane"]);
  });

  it("cleans doubled text and 'View profile' noise", () => {
    expect(cleanText("Jane DoeJane Doe")).toBe("Jane Doe");
    expect(cleanText("Jane Doe View Jane Doe’s profile")).toBe("Jane Doe");
    expect(cleanText("   ")).toBeNull();
  });

  it("strips …more from bodies", () => {
    expect(cleanBody("Line one\n\nLine two\n…more")).toBe("Line one\nLine two");
  });

  it("parses counts in common formats", () => {
    expect(parseCount("1,234")).toBe(1234);
    expect(parseCount("1.234")).toBe(1234);
    expect(parseCount("12K followers")).toBe(12000);
    expect(parseCount("2.3M")).toBe(2300000);
    expect(parseCount("3,4K")).toBe(3400);
    expect(parseCount("248")).toBe(248);
    expect(parseCount("no number")).toBeNull();
    expect(parseCount("2nd")).toBeNull();
  });

  it("finds counts by keyword", () => {
    expect(countByKeyword(["React Like", "31 comments on Alex’s post"], /comments?/)).toBe(31);
    expect(countByKeyword(["1,204 reactions"], /reactions?/)).toBe(1204);
    expect(countByKeyword(["nothing here"], /reposts?/)).toBeNull();
  });

  it("reads relative times and degrees", () => {
    expect(relativeTime("2d • Edited •")).toBe("2d");
    expect(relativeTime("3 weeks ago")).toBe("3 weeks ago");
    expect(relativeTime("Founder")).toBeNull();
    expect(degree("• 2nd")).toBe("2nd");
    expect(degree("3rd+ degree connection")).toBe("3rd+");
    expect(degree("Founder")).toBeNull();
  });
});
