import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JOB_DESCRIPTION_MAX, externalApplyUrl, parseJobCard, parseJobCards, parseJobDetails, trimDescription } from "../../src/linkedin/parse/jobs.js";
import type { Snapshot } from "../../src/linkedin/snapshot.js";
import { JOB_FILTER_CODES, cleanLink, jobId, jobIdIn, jobUrl, searchJobsUrl, urls } from "../../src/linkedin/urls.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;

describe("job search results parser", () => {
  const snaps = json<Snapshot[]>("jobs-search.json");

  it("reads a card from field selectors", () => {
    expect(parseJobCard(snaps[0]!)).toEqual({
      job_id: "4012345601",
      title: "Senior Backend Engineer",
      company: "Northwind Labs",
      location: "Lisbon, Portugal",
      workplace: "hybrid",
      posted: "3 days ago",
      salary: "€70K/yr - €90K/yr",
      easy_apply: true,
      applied: false,
      closed: false,
      promoted: false,
      url: "https://www.linkedin.com/jobs/view/4012345601/",
    });
  });

  it("falls back to visible text and a currentJobId link when field selectors miss", () => {
    const job = parseJobCard(snaps[1]!)!;
    expect(job).toMatchObject({
      job_id: "4012345602",
      title: "Staff Platform Engineer",
      company: "Contoso Cloud",
      location: null,
      workplace: "remote",
      posted: "Reposted 2 weeks ago",
      salary: "$180K/yr - $220K/yr",
      easy_apply: false,
      promoted: true,
      url: "https://www.linkedin.com/jobs/view/4012345602/",
    });
  });

  it("reads the id from a slugged /jobs/view/ link", () => {
    expect(parseJobCard(snaps[4]!)).toMatchObject({ job_id: "4012345605", title: "Data Engineer", company: "Tailspin Toys", location: "Berlin, Germany", workplace: null, posted: "1 week ago" });
  });

  it("skips cards LinkedIn hasn't rendered yet, drops duplicates and respects the limit", () => {
    expect(parseJobCards(snaps, 25).map((j) => j.job_id)).toEqual(["4012345601", "4012345602", "4012345605"]);
    expect(parseJobCards(snaps, 2)).toHaveLength(2);
  });
});

describe("saved jobs parser", () => {
  const jobs = parseJobCards(json<Snapshot[]>("saved-jobs.json"), 25);

  it("reads saved jobs with applied and closed states", () => {
    expect(jobs.map((j) => j.job_id)).toEqual(["4012345601", "4012345607", "4012345609"]);
    expect(jobs[0]).toMatchObject({ title: "Senior Backend Engineer", posted: "Posted 2w ago", easy_apply: true, applied: false, closed: false, workplace: "hybrid" });
    expect(jobs[1]).toMatchObject({ title: "Product Designer", company: "Fabrikam", location: "Porto, Portugal", workplace: "on-site", posted: null, applied: true });
    expect(jobs[2]).toMatchObject({ title: "Growth Marketing Lead", company: "Woodgrove Bank", location: "London, United Kingdom", workplace: "remote", closed: true });
  });
});

describe("job details parser", () => {
  const snaps = json<Snapshot[]>("job-details.json");

  it("reads an Easy Apply job from field selectors", () => {
    const job = parseJobDetails(snaps[0]!, "4012345601");
    expect(job).toMatchObject({
      job_id: "4012345601",
      url: "https://www.linkedin.com/jobs/view/4012345601/",
      title: "Senior Backend Engineer",
      company: "Northwind Labs",
      company_url: "https://www.linkedin.com/company/northwind-labs/",
      location: "Lisbon, Portugal",
      workplace: "hybrid",
      employment_type: "Full-time",
      posted: "Reposted 1 week ago",
      applicants: "Over 100 applicants",
      salary: "€70K/yr - €90K/yr",
      apply_type: "easy_apply",
      apply_url: null,
      description_truncated: false,
    });
    expect(job.description).toBe(
      "We're hiring a senior backend engineer to own our billing platform.\nWhat you'll do\n- Design and run services in TypeScript and Postgres\n- Mentor two engineers\nWhat we offer\n- A hybrid setup with two office days",
    );
  });

  it("falls back to visible text and finds the external apply URL", () => {
    const job = parseJobDetails(snaps[1]!, "4012345602");
    expect(job).toMatchObject({
      title: "Staff Platform Engineer",
      company: "Contoso Cloud",
      company_url: "https://www.linkedin.com/company/contoso-cloud/",
      location: null,
      workplace: "remote",
      employment_type: "Full-time",
      posted: "2 days ago",
      applicants: "57 applicants",
      salary: null,
      apply_type: "external",
      apply_url: "https://careers.contoso.example/jobs/123?source=linkedin",
    });
    expect(job.description).toBe("Contoso Cloud builds developer infrastructure.\nYou will lead our Kubernetes platform team.");
  });

  it("ignores Easy Apply badges on similar jobs further down the page", () => {
    // Fixture 2's only "Easy Apply" belongs to a "People also viewed" card.
    expect(parseJobDetails(snaps[1]!, "4012345602").apply_type).toBe("external");
  });

  it("reports closed jobs", () => {
    const s = snaps[0]!;
    const closed: Snapshot = {
      ...s,
      text: s.text.replace("Easy Apply\nSave\nAbout the job", "No longer accepting applications\nSave\nAbout the job"),
      fields: { ...s.fields, apply: null },
      attrs: { ...s.attrs, applyLabel: null },
    };
    expect(parseJobDetails(closed, "4012345601")).toMatchObject({ apply_type: "closed", apply_url: null });
  });

  it("trims long descriptions and says so", () => {
    const s = snaps[0]!;
    const long = parseJobDetails({ ...s, fields: { ...s.fields, description: `About the job\n${"Build reliable systems. ".repeat(400)}` } }, "4012345601");
    expect(long.description_truncated).toBe(true);
    expect(long.description!.length).toBeLessThanOrEqual(JOB_DESCRIPTION_MAX + 1);
    expect(long.description!.endsWith("…")).toBe(true);
    expect(trimDescription("short")).toEqual({ text: "short", truncated: false });
    expect(trimDescription(null)).toEqual({ text: null, truncated: false });
  });

  it("only exposes apply URLs that lead off LinkedIn", () => {
    expect(externalApplyUrl("https://www.linkedin.com/jobs/view/externalApply/1?url=https%3A%2F%2Fjobs.example%2F9")).toBe("https://jobs.example/9");
    expect(externalApplyUrl("https://jobs.example/apply/9")).toBe("https://jobs.example/apply/9");
    expect(externalApplyUrl("https://www.linkedin.com/jobs/view/123/")).toBeNull();
    expect(externalApplyUrl(null)).toBeNull();
    // Only plain web links reach the assistant.
    expect(externalApplyUrl("javascript:alert(1)")).toBeNull();
    expect(externalApplyUrl("data:text/html,hi")).toBeNull();
    expect(externalApplyUrl("https://www.linkedin.com/jobs/view/externalApply/1?url=javascript%3Aalert(1)")).toBe("https://www.linkedin.com/jobs/view/externalApply/1?url=javascript%3Aalert(1)");
    expect(externalApplyUrl("https://www.linkedin.com/jobs/view/123/?url=file%3A%2F%2F%2Fetc%2Fpasswd")).toBeNull();
  });
});

describe("job URLs and filters", () => {
  it("accepts job URLs, URNs and ids", () => {
    expect(jobId("4012345601")).toBe("4012345601");
    expect(jobId("https://www.linkedin.com/jobs/view/4012345601/?trackingId=x")).toBe("4012345601");
    expect(jobId("https://www.linkedin.com/jobs/view/senior-backend-engineer-at-northwind-labs-4012345601")).toBe("4012345601");
    expect(jobId("https://www.linkedin.com/jobs/search/?currentJobId=4012345601&keywords=backend")).toBe("4012345601");
    expect(jobId("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345601")).toBe("4012345601");
    expect(jobId("urn:li:fsd_jobPosting:4012345601")).toBe("4012345601");
    expect(jobUrl("linkedin.com/jobs/view/4012345601")).toBe("https://www.linkedin.com/jobs/view/4012345601/");
    for (const bad of ["https://example.com/jobs/view/4012345601/", "backend engineer", "123", "https://www.linkedin.com/jobs/", ""]) {
      expect(() => jobId(bad), bad).toThrow(/not a LinkedIn job URL/);
    }
    expect(jobIdIn("https://www.linkedin.com/feed/")).toBeNull();
  });

  it("maps filters to LinkedIn's job search codes", () => {
    expect(JOB_FILTER_CODES.datePosted).toEqual({ "past-24h": "r86400", "past-week": "r604800", "past-month": "r2592000" });
    expect(JOB_FILTER_CODES.workplace).toEqual({ "on-site": "1", remote: "2", hybrid: "3" });
    expect(JOB_FILTER_CODES.experience).toEqual({ internship: "1", entry: "2", associate: "3", "mid-senior": "4", director: "5", executive: "6" });
  });

  it("builds a job search URL", () => {
    const u = new URL(
      searchJobsUrl({
        keywords: "backend engineer",
        location: " Lisbon, Portugal ",
        datePosted: "past-week",
        workplace: ["remote", "hybrid", "remote"],
        experience: ["mid-senior", "entry"],
        easyApplyOnly: true,
      }),
    );
    expect(u.origin + u.pathname).toBe("https://www.linkedin.com/jobs/search/");
    expect(u.searchParams.get("keywords")).toBe("backend engineer");
    expect(u.searchParams.get("location")).toBe("Lisbon, Portugal");
    expect(u.searchParams.get("f_TPR")).toBe("r604800");
    expect(u.searchParams.get("f_WT")).toBe("2,3");
    expect(u.searchParams.get("f_E")).toBe("2,4");
    expect(u.searchParams.get("f_AL")).toBe("true");

    const plain = new URL(searchJobsUrl({ keywords: "designer", easyApplyOnly: false, workplace: [] }));
    expect([...plain.searchParams.keys()]).toEqual(["keywords"]);
    expect(urls.savedJobs()).toBe("https://www.linkedin.com/my-items/saved-jobs/");
  });

  it("normalises job links", () => {
    expect(cleanLink("https://www.linkedin.com/jobs/view/4012345601/?eBP=x&trackingId=y")).toBe("https://www.linkedin.com/jobs/view/4012345601/");
    expect(cleanLink("/jobs/search/?currentJobId=4012345602&keywords=x")).toBe("https://www.linkedin.com/jobs/view/4012345602/");
  });
});
