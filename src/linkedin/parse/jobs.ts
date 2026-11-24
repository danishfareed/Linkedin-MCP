import type { Snapshot } from "../snapshot.js";
import { BASE, type WorkplaceType, cleanLink, jobIdIn } from "../urls.js";
import { cleanBody, cleanText, isNoise, lines } from "./text.js";

export interface JobCard {
  job_id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  workplace: WorkplaceType | null;
  /** As LinkedIn shows it, e.g. "3 days ago" or "Reposted 1 week ago". */
  posted: string | null;
  salary: string | null;
  easy_apply: boolean;
  /** You already applied (LinkedIn shows "Applied …"). */
  applied: boolean;
  /** LinkedIn says the job no longer accepts applications. */
  closed: boolean;
  promoted: boolean;
  url: string;
}

export interface JobDetails {
  job_id: string;
  url: string;
  title: string | null;
  company: string | null;
  company_url: string | null;
  location: string | null;
  workplace: WorkplaceType | null;
  employment_type: string | null;
  posted: string | null;
  applicants: string | null;
  salary: string | null;
  apply_type: "easy_apply" | "external" | "closed" | null;
  apply_url: string | null;
  description: string | null;
  description_truncated: boolean;
}

export const JOB_DESCRIPTION_MAX = 4000;

const MONEY = String.raw`(?:[$€£₹¥]|\b(?:USD|EUR|GBP|INR|CAD|AUD|CHF|SGD)\s?)\s?\d[\d,.]*\s?[KkMm]?`;
const PER = String.raw`(?:\s?\/\s?(?:yr|year|hr|hour|mo|month|wk|week|day))?`;
const SALARY_RE = new RegExp(`${MONEY}${PER}(?:\\s?[-–]\\s?${MONEY}${PER})?`);
const POSTED_RE = /^(?:(?:re)?posted\s+)?(?:\d+\+?\s?(?:seconds?|minutes?|hours?|days?|weeks?|months?|years?|m|h|d|w|mo|yr)\s+ago|just now|today|yesterday)$/i;
const APPLIED_RE = /^applied\b/i;
const CLOSED_RE = /no longer accepting applications|applications are closed|this job is no longer available/i;
const APPLICANTS_RE = /\b(?:over\s+)?\d[\d,]*\+?\s+(?:applicants?|people clicked apply)\b/i;
/** A workplace badge line: "Hybrid", "Remote Matches your job preferences…", "(Hybrid)", "workplace type is Remote". */
const WORKPLACE_LINE_RE = /^(on-site|onsite|remote|hybrid)\b|\((on-site|onsite|remote|hybrid)\)|workplace type is (on-site|onsite|remote|hybrid)/i;
const EMPLOYMENT_LINE_RE = /^(full-time|part-time|contract|temporary|internship|volunteer)\b|job type is (full-time|part-time|contract|temporary|internship|volunteer)/i;

/** Lines on a job card that are badges or chrome, not title/company/location. */
const CARD_NOISE =
  /^(promoted|promoted by hirer|viewed|saved|easy apply|apply|unsave|new|actively (reviewing applicants|recruiting|hiring)|be an early applicant|early applicant|you('d| would) be a top applicant|top applicant|your profile matches .*|how you match|in your network|response insights?.*|dismiss .*|\d+ (school |company )?alumni works? here|\d+ connections? works? here|verified|·|•|show more|show less|(over )?\d[\d,]* applicants?|.*\+\d+ benefits?|401\(k\)( benefit)?)$/i;

function toWorkplace(v: string): WorkplaceType {
  const s = v.toLowerCase();
  return s === "remote" ? "remote" : s === "hybrid" ? "hybrid" : "on-site";
}

/** The workplace type from badge-like lines only, so a title like "Hybrid Cloud Engineer" doesn't count. */
export function workplaceIn(text: string | null | undefined): WorkplaceType | null {
  for (const l of lines(text)) {
    const m = WORKPLACE_LINE_RE.exec(l);
    if (m) return toWorkplace((m[1] ?? m[2] ?? m[3])!);
  }
  return null;
}

function employmentIn(text: string | null | undefined): string | null {
  for (const l of lines(text)) {
    for (const part of l.split(/\s*[·•]\s*/)) {
      const m = EMPLOYMENT_LINE_RE.exec(part);
      if (m) return (m[1] ?? m[2])!;
    }
  }
  return null;
}

export function salaryIn(text: string | null | undefined): string | null {
  const m = text ? SALARY_RE.exec(text) : null;
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function stripVerification(s: string | null): string | null {
  return s ? s.replace(/\s+with verification$/i, "").trim() || null : null;
}

/** "Lisbon, Portugal (Hybrid)" → location "Lisbon, Portugal", workplace "hybrid". */
function splitLocation(raw: string | null): { location: string | null; workplace: WorkplaceType | null } {
  if (!raw) return { location: null, workplace: null };
  const paren = /\s*\((on-site|onsite|remote|hybrid)\)\s*$/i.exec(raw);
  if (paren) return { location: raw.slice(0, paren.index).trim() || null, workplace: toWorkplace(paren[1]!) };
  if (/^(on-site|onsite|remote|hybrid)$/i.test(raw)) return { location: null, workplace: toWorkplace(raw) };
  return { location: raw, workplace: null };
}

function jobIdOf(s: Snapshot): string | null {
  for (const v of [s.attrs.occludableId, s.attrs.selfJobId, s.attrs.innerJobId]) {
    if (v && /^\d{6,15}$/.test(v.trim())) return v.trim();
  }
  for (const v of [s.attrs.link, s.urn, ...s.links.map((l) => l.href)]) {
    const id = jobIdIn(v);
    if (id) return id;
  }
  return null;
}

/** One job card from search results or saved jobs. Returns null for cards LinkedIn hasn't rendered yet. */
export function parseJobCard(s: Snapshot): JobCard | null {
  const id = jobIdOf(s);
  if (!id) return null;
  const f = s.fields;
  const all = lines(s.text).map((l) => stripVerification(l)!).filter(Boolean);
  // Drop the doubled title LinkedIn renders for screen readers ("Title", "Title with verification").
  const ls = all.filter((l, i) => l !== all[i - 1]);

  const postedLine = ls.find((l) => POSTED_RE.test(l)) ?? null;
  const postedField = cleanText(f.posted);
  const posted = postedField && !APPLIED_RE.test(postedField) ? postedField : postedLine;
  const salary = salaryIn(ls.find((l) => salaryIn(l) && l.length < 80));

  const content = ls.filter((l) => !CARD_NOISE.test(l) && !isNoise(l) && !POSTED_RE.test(l) && !APPLIED_RE.test(l) && !CLOSED_RE.test(l) && !salaryIn(l));
  const linkTitle = s.links.find((l) => jobIdIn(l.href) && l.text.trim() && !/^(easy )?apply$/i.test(l.text.trim()))?.text ?? null;
  const title = stripVerification(cleanText(f.title)) ?? stripVerification(cleanText(linkTitle)) ?? content[0] ?? null;
  const rest = content.filter((l) => l !== title);
  const company = cleanText(f.company) ?? rest[0] ?? null;
  const locationRaw = cleanText(f.location) ?? rest.filter((l) => l !== company)[0] ?? null;
  const { location, workplace } = splitLocation(locationRaw);

  const badges = [s.text, f.footer, ...s.labels].join("\n");
  return {
    job_id: id,
    title,
    company,
    location,
    workplace: workplace ?? workplaceIn(f.location),
    posted,
    salary,
    easy_apply: /^\s*easy apply\s*$/im.test(badges),
    applied: ls.some((l) => APPLIED_RE.test(l)) || APPLIED_RE.test(postedField ?? ""),
    closed: CLOSED_RE.test(s.text),
    promoted: /^\s*promoted\b/im.test(badges),
    url: `${BASE}/jobs/view/${id}/`,
  };
}

export function parseJobCards(snapshots: Snapshot[], limit: number): JobCard[] {
  const seen = new Set<string>();
  const out: JobCard[] = [];
  for (const s of snapshots) {
    const job = parseJobCard(s);
    if (!job || !job.title || seen.has(job.job_id)) continue;
    seen.add(job.job_id);
    out.push(job);
    if (out.length >= limit) break;
  }
  return out;
}

/** Where the description ends on a job page. */
const DESCRIPTION_END =
  /^(set alert for similar jobs|about the company|meet the hiring team|people you can reach out to|more jobs|similar jobs|show less|see less|job search faster with premium|looking for talent\?|interested in working with us in the future\?|company photos|benefits found in job post)$/i;

function sectionAfter(ls: string[], heading: RegExp): string[] {
  const i = ls.findIndex((l) => heading.test(l));
  if (i < 0) return [];
  const out: string[] = [];
  for (let j = i + 1; j < ls.length && !DESCRIPTION_END.test(ls[j]!); j++) out.push(ls[j]!);
  return out;
}

/** Cut at a word boundary and say whether anything was cut. */
export function trimDescription(text: string | null, max = JOB_DESCRIPTION_MAX): { text: string | null; truncated: boolean } {
  if (!text || text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const space = cut.search(/\s\S*$/);
  return { text: `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`, truncated: true };
}

/** The real apply destination behind LinkedIn's external apply link, when the page exposes it. */
export function externalApplyUrl(href: string | null | undefined): string | null {
  if (!href) return null;
  let u: URL;
  try {
    u = new URL(href, BASE);
  } catch {
    return null;
  }
  const target = u.searchParams.get("url");
  if (target && /^https?:\/\//i.test(target)) return target;
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return u.toString();
  return /externalApply/i.test(u.pathname) ? u.toString() : null;
}

function splitDots(line: string): string[] {
  return line
    .split(/\s*[·•]\s*/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/** Splits "Lisbon, Portugal · Reposted 1 week ago · Over 100 applicants" into its parts. Older layouts start with the company. */
function primaryParts(text: string | null, company: string | null): { location: string | null; posted: string | null; applicants: string | null } {
  const parts = lines(text).flatMap(splitDots);
  const posted = parts.find((p) => POSTED_RE.test(p)) ?? null;
  const applicants = parts.map((p) => APPLICANTS_RE.exec(p)?.[0] ?? null).find(Boolean) ?? null;
  const location =
    parts.find(
      (p) =>
        p !== posted &&
        p !== company &&
        !APPLICANTS_RE.test(p) &&
        !/^(promoted|promoted by hirer|actively (reviewing applicants|recruiting|hiring)|responses managed off linkedin|no longer accepting applications)/i.test(p),
    ) ?? null;
  return { location, posted, applicants };
}

export function parseJobDetails(s: Snapshot, id: string): JobDetails {
  const f = s.fields;
  const all = lines(s.text);
  const aboutAt = all.findIndex((l) => /^about the job$/i.test(l));
  // The top card: everything before the description. Similar-job cards further down must not leak in.
  const top = aboutAt >= 0 ? all.slice(0, aboutAt) : all.slice(0, 30);
  const topText = top.join("\n");

  const companyLink = s.attrs.companyLink ?? s.links.find((l) => /\/company\//.test(l.href))?.href ?? null;
  const companyFromLink = s.links.find((l) => /\/company\//.test(l.href) && l.text.trim())?.text ?? null;
  const company = cleanText(f.company) ?? cleanText(companyFromLink);

  const primaryFallback = top.find((l) => /[·•]/.test(l) && splitDots(l).some((p) => POSTED_RE.test(p) || APPLICANTS_RE.test(p))) ?? null;
  const primary = primaryParts(cleanBody(f.primary) ?? primaryFallback, company);
  const { location, workplace: locWorkplace } = splitLocation(primary.location);

  let description = cleanBody(f.description) ?? cleanBody(sectionAfter(all, /^about the job$/i).join("\n"));
  if (description) {
    description = cleanBody(lines(description).filter((l, i) => !(i === 0 && /^about the job$/i.test(l)) && !isNoise(l)).join("\n"));
  }
  const trimmed = trimDescription(description);

  const applyText = [f.apply, s.attrs.applyLabel].filter(Boolean).join("\n");
  const applyLink = s.attrs.applyLink ?? s.links.find((l) => /externalApply/i.test(l.href))?.href ?? null;
  let apply_type: JobDetails["apply_type"] = null;
  if (CLOSED_RE.test(topText) || CLOSED_RE.test(applyText)) apply_type = "closed";
  else if (/easy apply/i.test(applyText) || top.some((l) => /^easy apply$/i.test(l))) apply_type = "easy_apply";
  else if (/\bapply\b/i.test(applyText) || applyLink || top.some((l) => /^apply( on company website)?$/i.test(l))) apply_type = "external";

  return {
    job_id: id,
    url: `${BASE}/jobs/view/${id}/`,
    title: stripVerification(cleanText(f.title)),
    company,
    company_url: cleanLink(companyLink),
    location,
    workplace: locWorkplace ?? workplaceIn(f.insights) ?? workplaceIn(topText),
    employment_type: employmentIn(f.insights) ?? employmentIn(topText),
    posted: primary.posted,
    applicants: primary.applicants ?? APPLICANTS_RE.exec(topText)?.[0] ?? null,
    salary: salaryIn(f.salary) ?? salaryIn(f.insights) ?? salaryIn(topText),
    apply_type,
    apply_url: apply_type === "external" ? externalApplyUrl(applyLink) : null,
    description: trimmed.text,
    description_truncated: trimmed.truncated,
  };
}
