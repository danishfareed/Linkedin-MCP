import type { Nav } from "../../browser/session.js";
import { LinkedInMcpError, notFound, selectorBroken } from "../../errors.js";
import { extractSnapshots, findOptional, waitForAny } from "../dom.js";
import { type JobCard, type JobDetails, parseJobCards, parseJobDetails } from "../parse/jobs.js";
import { JOB_EXTRACT, JOB_SEL } from "../selectors.js";
import { type JobSearchFilters, jobId, jobUrl, searchJobsUrl, urls } from "../urls.js";
import { collectList, listOf, mainText } from "./listing.js";

/** LinkedIn's wording for a job search with no results. */
const NO_JOBS_TEXT = /no matching jobs found|no jobs found|we couldn['’]t find (a match|any jobs|any matching jobs)|no results found/i;
const NO_SAVED_JOBS_TEXT = /no saved jobs|you haven['’]t saved any jobs|jobs you save (will )?(show|appear) (up )?here|start saving jobs/i;
const JOB_GONE_TEXT = /no longer available|this job (posting )?(was|has been) (removed|closed|taken down)|page not found|page doesn['’]t exist|couldn['’]t find (this|that) job/i;

export interface JobList {
  jobs: JobCard[];
  complete: boolean;
  note?: string;
}

/**
 * Job results live in their own scrolling column, and cards below the fold stay
 * empty until scrolled into view. Wheel over that column like a person would;
 * if it can't be found, bring the last card into view instead.
 */
async function scrollJobList(nav: Nav): Promise<void> {
  const pane = await findOptional(nav.page, JOB_SEL.listPane, { timeout: 0 });
  const box = pane ? await pane.boundingBox().catch(() => null) : null;
  if (box && box.height > 80 && box.width > 80) {
    const vh = nav.page.viewportSize()?.height ?? 800;
    const y = Math.min(Math.max(box.y + box.height / 2, 120), vh - 60);
    await nav.page.mouse.move(box.x + box.width / 2, y, { steps: 6 });
    await nav.pacer.scroll(nav.page, 2);
    return;
  }
  const cards = nav.page.locator(JOB_EXTRACT.card.container.join(", "));
  const n = await cards.count().catch(() => 0);
  if (n) await cards.nth(n - 1).scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => undefined);
  await nav.pacer.beat(900, 1800);
}

/** One page of job search results (LinkedIn shows up to 25 per page). */
export async function searchJobs(nav: Nav, filters: JobSearchFilters, limit: number): Promise<JobList & { search_url: string }> {
  const url = searchJobsUrl(filters);
  await nav.goto(url);
  const r = await collectList(nav, {
    spec: JOB_EXTRACT.card,
    name: "job results",
    parse: (s) => parseJobCards(s, limit),
    key: (j) => j.job_id,
    limit,
    maxRounds: 8,
    emptyText: NO_JOBS_TEXT,
    scroll: scrollJobList,
    loadMore: false,
  });
  return { search_url: url, ...listOf("jobs", r) };
}

/** The first page of the user's saved jobs. */
export async function readSavedJobs(nav: Nav, limit: number): Promise<JobList> {
  await nav.goto(urls.savedJobs());
  const r = await collectList(nav, {
    spec: JOB_EXTRACT.saved,
    name: "saved jobs",
    parse: (s) => parseJobCards(s, limit),
    key: (j) => j.job_id,
    limit,
    maxRounds: 3,
    emptyText: NO_SAVED_JOBS_TEXT,
  });
  if (!r.complete && r.items.length && (await findOptional(nav.page, JOB_SEL.nextPage, { timeout: 0 }))) {
    r.note = `Read the first page of your saved jobs (${r.items.length}). LinkedIn lists more on later pages: ${urls.savedJobs()}`;
  }
  return listOf("jobs", r);
}

/** Full details for one job. Read-only: it never clicks Apply or Save. */
export async function readJobDetails(nav: Nav, input: string): Promise<JobDetails> {
  const id = jobId(input);
  const url = jobUrl(id);
  await nav.goto(url);
  await waitForAny(nav.page, JOB_EXTRACT.detailsReady, 15_000);
  if (/\/(404|unavailable)(\/|\?|$)/i.test(nav.page.url())) throw notFound("That job", { url });
  // The description renders after the top card.
  await waitForAny(nav.page, JOB_EXTRACT.details.fields.description, 8000);
  const [snap] = await extractSnapshots(nav.page, JOB_EXTRACT.details);
  if (!snap || (!snap.fields.title && !snap.fields.description)) {
    const text = snap?.text ?? (await mainText(nav.page));
    if (JOB_GONE_TEXT.test(text)) throw notFound("That job", { url });
    if (text.replace(/\s+/g, " ").trim().length < 80) {
      throw new LinkedInMcpError(
        "TIMEOUT",
        "The LinkedIn job page didn't finish loading.",
        "Try again in a minute. If it keeps happening, run `npx @danishfareed/linkedin-mcp doctor`.",
        { url },
      );
    }
    throw selectorBroken("jobs.details", { url });
  }
  return parseJobDetails(snap, id);
}
