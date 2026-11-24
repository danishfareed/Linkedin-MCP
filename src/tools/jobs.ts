import { z } from "zod";
import { withBrowser } from "../context.js";
import { invalidInput } from "../errors.js";
import { readJobDetails, readSavedJobs, searchJobs } from "../linkedin/pages/jobs.js";
import { JOB_DESCRIPTION_MAX } from "../linkedin/parse/jobs.js";
import { DATE_POSTED, EXPERIENCE_LEVELS, WORKPLACE_TYPES, jobId } from "../linkedin/urls.js";
import { READ, defineTool } from "./registry.js";

export const JOB_SEARCH_MAX = 25;
export const SAVED_JOBS_MAX = 25;

export const jobTools = [
  defineTool({
    name: "search_jobs",
    title: "Search LinkedIn jobs",
    description:
      `Search LinkedIn job postings. Returns one page, at most ${JOB_SEARCH_MAX} jobs (job_id, title, company, location, workplace, posted, salary if shown, easy_apply, url) plus complete/note when fewer than asked for could be read. ` +
      "Pass a job_id or url to get_job_details for the full posting. Read-only: it never applies to jobs. Counts against the daily search limit.",
    input: {
      keywords: z.string().min(1).max(200).describe("Job title, skill or company, e.g. \"backend engineer\"."),
      location: z.string().max(100).optional().describe("City, region or country as you'd type it on LinkedIn, e.g. \"Lisbon, Portugal\" or \"Remote\"."),
      date_posted: z.enum(DATE_POSTED).optional().describe("Only jobs posted in the past 24 hours, week or month."),
      workplace: z.array(z.enum(WORKPLACE_TYPES)).max(3).optional().describe("Any of on-site, remote, hybrid."),
      experience: z.array(z.enum(EXPERIENCE_LEVELS)).max(6).optional().describe("Any of internship, entry, associate, mid-senior, director, executive."),
      easy_apply_only: z.boolean().default(false).describe("Only jobs with LinkedIn Easy Apply."),
      limit: z.number().int().min(1).max(JOB_SEARCH_MAX).default(10),
    },
    annotations: READ,
    handler: async (args, ctx) => {
      if (!args.keywords.trim()) throw invalidInput("Give keywords to search for.");
      await ctx.limits.assertAvailable("search");
      const filters = {
        keywords: args.keywords.trim(),
        location: args.location,
        datePosted: args.date_posted,
        workplace: args.workplace,
        experience: args.experience,
        easyApplyOnly: args.easy_apply_only,
      };
      return withBrowser(ctx, async (nav) => {
        await ctx.limits.consume("search");
        return searchJobs(nav, filters, args.limit);
      });
    },
  }),

  defineTool({
    name: "get_job_details",
    title: "Read a job posting",
    description:
      "Full details of one LinkedIn job: title, company and company URL, location, workplace type, employment type, when it was posted, applicant count and salary when LinkedIn shows them, " +
      `the description (trimmed to about ${JOB_DESCRIPTION_MAX} characters; description_truncated says when it was cut), and how to apply (easy_apply, external with apply_url when exposed, or closed). ` +
      "Read-only: it never clicks Apply or Save.",
    input: { job: z.string().min(1).describe("Job URL (https://www.linkedin.com/jobs/view/1234567890/, or any jobs link with currentJobId=…) or the numeric job id.") },
    annotations: READ,
    handler: async (args, ctx) => {
      const id = jobId(args.job);
      return withBrowser(ctx, (nav) => readJobDetails(nav, id));
    },
  }),

  defineTool({
    name: "get_saved_jobs",
    title: "List your saved jobs",
    description:
      `Jobs the user saved on LinkedIn (first page only, at most ${SAVED_JOBS_MAX}): job_id, title, company, location, posted, whether they already applied and whether the job is closed, plus complete/note. Read-only.`,
    input: { limit: z.number().int().min(1).max(SAVED_JOBS_MAX).default(10) },
    annotations: READ,
    handler: async (args, ctx) => withBrowser(ctx, (nav) => readSavedJobs(nav, args.limit)),
  }),
];
