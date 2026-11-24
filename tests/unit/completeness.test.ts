import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { finishList, listEnded, listPayload } from "../../src/linkedin/parse/list.js";
import { detailsLink, missingSections, parseDetailsEntries, parseProfile, planDetails, profileCompleteness } from "../../src/linkedin/parse/profile.js";
import { EXTRACT } from "../../src/linkedin/selectors.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

describe("list completeness", () => {
  it("is complete when the limit was reached or the list ended", () => {
    expect(finishList([1, 2, 3, 4], 3, { rounds: 1, maxRounds: 4, exhausted: false }, "notifications")).toEqual({ items: [1, 2, 3], complete: true });
    expect(finishList([1, 2], 5, { rounds: 2, maxRounds: 4, exhausted: true }, "notifications")).toEqual({ items: [1, 2], complete: true });
  });

  it("says so when it stopped early", () => {
    const r = finishList([1, 2], 10, { rounds: 4, maxRounds: 4, exhausted: false }, "notifications");
    expect(r.complete).toBe(false);
    expect(r.note).toMatch(/Stopped after 4 attempts to load more notifications, with 2 of the 10 requested/);
    expect(finishList([], 3, { rounds: 1, maxRounds: 1, exhausted: false }, "messages").note).toMatch(/1 attempt to/);
  });

  it("decides a list ended only when nothing was added and LinkedIn offered no more", () => {
    expect(listEnded(5, 5, false)).toBe(true);
    expect(listEnded(5, 5, true)).toBe(false);
    expect(listEnded(5, 8, false)).toBe(false);
  });

  it("builds the tool payload with the completeness flag", () => {
    expect(listPayload("people", { items: [1], complete: true })).toEqual({ people: [1], complete: true });
    expect(listPayload("notifications", { items: [], complete: false, note: "n" })).toEqual({ notifications: [], complete: false, note: "n" });
  });
});

describe("profile completeness", () => {
  const f = json<{ main_sections: Snapshot[]; details_sections: Snapshot[] }>("profile-long.json");
  const top: Snapshot = { urn: null, depth: 0, text: "Taylor Brooks\nVP Marketing", links: [], labels: [], fields: { name: "Taylor Brooks" }, attrs: {}, items: [] };

  it("falls back to the h2 name heading in the top card", () => {
    expect(EXTRACT.profileTop.fields.name).toEqual(["h1", "h2"]);
    expect(EXTRACT.profileTop.container[0]).toMatch(/section:has\(h1\)/);
    expect(EXTRACT.profileTop.container[1]).toMatch(/section:has\(h2\)/);
  });

  it("finds the details page behind a section's Show all link", () => {
    expect(detailsLink(f.main_sections[0]!, "experience")).toBe("https://www.linkedin.com/in/taylor-brooks/details/experience/");
    expect(detailsLink(f.main_sections[1]!, "education")).toBeNull();
  });

  it("plans details pages for long Experience/Education and flags other cut-off sections", () => {
    const plan = planDetails(f.main_sections, ["experience", "education", "skills"]);
    expect(plan.fetch).toEqual([{ key: "experience", url: "https://www.linkedin.com/in/taylor-brooks/details/experience/" }]);
    expect(plan.truncated).toEqual(["skills"]);
    expect(planDetails(f.main_sections, ["education"])).toEqual({ fetch: [], truncated: [] });
  });

  it("reads every entry from the details page", () => {
    const entries = parseDetailsEntries(f.details_sections, "experience");
    expect(entries).toHaveLength(5);
    expect(entries[4]).toMatchObject({ title: "Marketing Associate", subtitle: "Northwind Traders" });
  });

  it("knows which requested sections haven't rendered yet", () => {
    expect(missingSections(f.main_sections, ["about", "experience", "certifications"])).toEqual(["certifications"]);
  });

  it("marks a profile incomplete only when a section may be cut short", () => {
    expect(parseProfile(top, f.main_sections, ["experience"], null).complete).toBe(true);
    expect(profileCompleteness([])).toEqual({ complete: true });
    expect(profileCompleteness(["skills"])).toMatchObject({ complete: false, note: expect.stringMatching(/skills/) });
  });
});
