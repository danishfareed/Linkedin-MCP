import { LinkedInMcpError, invalidInput } from "../../errors.js";
import { readJson, updateJson } from "../../state/store.js";
import { localDayKey } from "../../util/time.js";
import { deepMerge } from "./files.js";
import { FUNNEL_STAGES, type GrowthProfile, type StrategyDraft, strategyDraftSchema } from "./schemas.js";

export type StrategyStatus = "draft" | "approved" | "superseded" | "archived";

export interface StrategyVersion {
  version: number;
  status: StrategyStatus;
  created_at: string;
  updated_at: string;
  approved_at?: string;
  superseded_at?: string;
  archived_at?: string;
  /** The version this draft started from, if any. */
  based_on?: number;
  change_note?: string;
  strategy: StrategyDraft;
}

export interface StrategyFile {
  schema: 1;
  versions: StrategyVersion[];
}

const EMPTY: StrategyFile = { schema: 1, versions: [] };

/** Shares may be off by rounding: 33 + 33 + 33 is fine. */
const SHARE_TOLERANCE = 2;

export async function readStrategy(file: string): Promise<StrategyFile> {
  const raw = await readJson<StrategyFile>(file, EMPTY);
  return { schema: 1, versions: Array.isArray(raw.versions) ? raw.versions : [] };
}

export function approvedVersion(f: StrategyFile): StrategyVersion | null {
  return [...f.versions].reverse().find((v) => v.status === "approved") ?? null;
}

export function latestDraft(f: StrategyFile): StrategyVersion | null {
  return [...f.versions].reverse().find((v) => v.status === "draft") ?? null;
}

/** The strategy plans run on: the approved one, else the latest draft. */
export function activeStrategy(f: StrategyFile): StrategyVersion | null {
  return approvedVersion(f) ?? latestDraft(f);
}

export interface ApprovalCheck {
  /** Must be fixed before approval. */
  blocking: string[];
  /** Worth a look, but approval is allowed. */
  warnings: string[];
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** What stops a draft from being approved, plus softer warnings. */
export function checkForApproval(s: StrategyDraft, opts: { now: Date; profile?: GrowthProfile }): ApprovalCheck {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (!s.positioning) blocking.push("positioning: add a positioning statement.");

  const pillars = s.pillars ?? [];
  if (pillars.length < 3 || pillars.length > 5) blocking.push(`pillars: use 3 to 5 content pillars (now ${pillars.length}).`);
  if (pillars.length) {
    const total = sum(pillars.map((p) => p.share_pct));
    if (Math.abs(total - 100) > SHARE_TOLERANCE) blocking.push(`pillars: shares add up to ${total}%, not 100%.`);
    for (const p of pillars) {
      if (!p.example_angles.length) blocking.push(`pillars.${p.name}: add at least one example angle.`);
      if (!p.proof_refs.length) blocking.push(`pillars.${p.name}: name the proof it draws on (proof bank ids or descriptions).`);
    }
    const proofIds = new Set((opts.profile?.proof_bank ?? []).map((p) => p.id));
    const unknown = pillars.flatMap((p) => p.proof_refs.filter((r) => /^p\d+$/.test(r) && !proofIds.has(r)));
    if (unknown.length) warnings.push(`pillars: proof ids not in the proof bank: ${[...new Set(unknown)].join(", ")}.`);
    const names = pillars.map((p) => p.name.toLowerCase());
    if (new Set(names).size !== names.length) blocking.push("pillars: pillar names must be unique.");
  }

  const fm = s.funnel_mix;
  if (!fm || fm.tof_pct === undefined || fm.mof_pct === undefined || fm.bof_pct === undefined) {
    blocking.push("funnel_mix: set tof_pct, mof_pct and bof_pct.");
  } else {
    const total = fm.tof_pct + fm.mof_pct + fm.bof_pct;
    if (Math.abs(total - 100) > SHARE_TOLERANCE) blocking.push(`funnel_mix: adds up to ${total}%, not 100%.`);
    if (!fm.reasons) blocking.push("funnel_mix: explain the reasons for this mix.");
    if (pillars.length) {
      for (const stage of FUNNEL_STAGES) {
        const fromPillars = sum(pillars.filter((p) => p.funnel_stage === stage).map((p) => p.share_pct));
        const stated = stage === "TOF" ? fm.tof_pct : stage === "MOF" ? fm.mof_pct : fm.bof_pct;
        if (Math.abs(fromPillars - stated) > 15) warnings.push(`funnel_mix: pillars put ${fromPillars}% in ${stage} but the mix says ${stated}%.`);
      }
    }
  }

  const c = s.cadence;
  if (!c?.posts_per_week) blocking.push("cadence: set posts_per_week.");
  if (!c?.days?.length) blocking.push("cadence: choose posting days.");
  if (!c?.time_windows?.length) blocking.push("cadence: set at least one time window.");
  if (c?.posts_per_week && c.days?.length && c.days.length < c.posts_per_week) {
    warnings.push(`cadence: ${c.posts_per_week} posts a week on ${c.days.length} day(s); the calendar plans at most one post a day.`);
  }
  const allowed = opts.profile?.posting_constraints?.days;
  if (allowed?.length && c?.days?.some((d) => !allowed.includes(d))) {
    warnings.push(`cadence: some days (${c.days.filter((d) => !allowed.includes(d)).join(", ")}) are outside the days the profile says the user can post.`);
  }

  const formats = s.format_mix ?? [];
  if (!formats.length) blocking.push("format_mix: add the mix of formats.");
  else if (Math.abs(sum(formats.map((f) => f.share_pct)) - 100) > SHARE_TOLERANCE) blocking.push(`format_mix: adds up to ${sum(formats.map((f) => f.share_pct))}%, not 100%.`);

  const e = s.engagement_plan;
  if (e?.daily_minutes === undefined) blocking.push("engagement_plan: set daily_minutes.");
  if (!e?.target_accounts?.length && !e?.target_topics?.length) blocking.push("engagement_plan: list target accounts or topics to engage with.");

  const ladder = s.cta_ladder ?? [];
  if (!ladder.length) blocking.push("cta_ladder: add at least one CTA.");
  else {
    const missingStages = FUNNEL_STAGES.filter((st) => !ladder.some((l) => l.funnel_stage === st));
    if (missingStages.length) warnings.push(`cta_ladder: no CTA for ${missingStages.join(", ")}.`);
  }

  if (!s.kpis?.length) blocking.push("kpis: add at least one KPI with a target and date.");
  if (!s.review_date) blocking.push("review_date: set a date to review the strategy.");
  else if (s.review_date <= localDayKey(opts.now)) blocking.push("review_date: must be in the future.");

  return { blocking, warnings };
}

function nextVersion(f: StrategyFile): number {
  return f.versions.reduce((m, v) => Math.max(m, v.version), 0) + 1;
}

export interface SaveDraftInput {
  strategy: StrategyDraft;
  /** What the draft builds on: the latest draft (else approved), the approved one, or nothing. */
  base: "latest" | "approved" | "empty";
  change_note?: string;
  /** Fills gaps (cadence windows from analytics, days from the profile). Returns notes. */
  fill?: (draft: StrategyDraft) => { draft: StrategyDraft; notes: string[] };
}

export interface SaveDraftResult {
  file: StrategyFile;
  saved: StrategyVersion;
  notes: string[];
}

/**
 * Saves a new draft version. Earlier drafts become superseded; the approved
 * strategy is never touched.
 */
export async function saveDraft(file: string, input: SaveDraftInput, now: Date): Promise<SaveDraftResult> {
  let saved: StrategyVersion | null = null;
  let notes: string[] = [];
  const next = await updateJson<StrategyFile>(file, EMPTY, (raw) => {
    const current: StrategyFile = { schema: 1, versions: Array.isArray(raw.versions) ? raw.versions : [] };
    const base = input.base === "empty" ? null : input.base === "approved" ? approvedVersion(current) : (latestDraft(current) ?? approvedVersion(current));
    if (input.base === "approved" && !base) throw invalidInput("There is no approved strategy to build on. Use base: \"latest\" or \"empty\".");
    let draft = deepMerge<StrategyDraft>(structuredClone(base?.strategy ?? {}), input.strategy);
    if (input.fill) {
      const filled = input.fill(draft);
      draft = filled.draft;
      notes = filled.notes;
    }
    const parsed = strategyDraftSchema.safeParse(draft);
    if (!parsed.success) throw invalidInput(`The draft isn't valid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    const stamp = now.toISOString();
    const versions = current.versions.map((v) => (v.status === "draft" ? { ...v, status: "superseded" as const, superseded_at: stamp, updated_at: stamp } : v));
    saved = {
      version: nextVersion(current),
      status: "draft",
      created_at: stamp,
      updated_at: stamp,
      ...(base ? { based_on: base.version } : {}),
      ...(input.change_note ? { change_note: input.change_note } : {}),
      strategy: parsed.data,
    };
    return { schema: 1, versions: [...versions, saved] };
  });
  return { file: next, saved: saved!, notes };
}

export interface ApproveInput {
  version?: number;
  replace_approved: boolean;
  profile?: GrowthProfile;
}

/** Approves a draft. An existing approved strategy is only replaced with replace_approved. */
export async function approveStrategy(file: string, input: ApproveInput, now: Date): Promise<{ file: StrategyFile; approved: StrategyVersion; warnings: string[] }> {
  let approved: StrategyVersion | null = null;
  let warnings: string[] = [];
  const next = await updateJson<StrategyFile>(file, EMPTY, (raw) => {
    const current: StrategyFile = { schema: 1, versions: Array.isArray(raw.versions) ? raw.versions : [] };
    const target = input.version !== undefined ? current.versions.find((v) => v.version === input.version) : latestDraft(current);
    if (!target) throw invalidInput(input.version !== undefined ? `Strategy version ${input.version} doesn't exist.` : "There is no draft to approve. Save one with action save_draft first.");
    if (target.status !== "draft") throw invalidInput(`Version ${target.version} is ${target.status}; only a draft can be approved.`);
    const check = checkForApproval(target.strategy, { now, profile: input.profile });
    if (check.blocking.length) {
      throw new LinkedInMcpError("INVALID_INPUT", `Version ${target.version} isn't ready to approve.`, "Fix the listed items with save_draft, then approve again.", { blocking: check.blocking, warnings: check.warnings });
    }
    const existing = approvedVersion(current);
    if (existing && !input.replace_approved) {
      throw new LinkedInMcpError(
        "INVALID_INPUT",
        `Version ${existing.version} is the approved strategy.`,
        "Show the user what changes, and only if they want it replaced, call approve again with replace_approved: true.",
        { approved_version: existing.version, draft_version: target.version },
      );
    }
    warnings = check.warnings;
    const stamp = now.toISOString();
    const versions = current.versions.map((v) => {
      if (v.version === target.version) {
        approved = { ...v, status: "approved", approved_at: stamp, updated_at: stamp };
        return approved;
      }
      if (v.status === "approved") return { ...v, status: "superseded" as const, superseded_at: stamp, updated_at: stamp };
      return v;
    });
    return { schema: 1, versions };
  });
  return { file: next, approved: approved!, warnings };
}

/** Archives one version. Archiving the approved strategy needs replace_approved. */
export async function archiveStrategy(file: string, input: { version: number; replace_approved: boolean }, now: Date): Promise<{ file: StrategyFile; archived: StrategyVersion }> {
  let archived: StrategyVersion | null = null;
  const next = await updateJson<StrategyFile>(file, EMPTY, (raw) => {
    const current: StrategyFile = { schema: 1, versions: Array.isArray(raw.versions) ? raw.versions : [] };
    const target = current.versions.find((v) => v.version === input.version);
    if (!target) throw invalidInput(`Strategy version ${input.version} doesn't exist.`);
    if (target.status === "archived") throw invalidInput(`Version ${input.version} is already archived.`);
    if (target.status === "approved" && !input.replace_approved) {
      throw new LinkedInMcpError(
        "INVALID_INPUT",
        `Version ${input.version} is the approved strategy.`,
        "Archiving it leaves no approved strategy. Only if the user wants that, call archive again with replace_approved: true.",
        { version: input.version },
      );
    }
    const stamp = now.toISOString();
    const versions = current.versions.map((v) => {
      if (v.version !== input.version) return v;
      archived = { ...v, status: "archived", archived_at: stamp, updated_at: stamp };
      return archived;
    });
    return { schema: 1, versions };
  });
  return { file: next, archived: archived! };
}

/** One line per version, newest first. */
export function historySummary(f: StrategyFile): { version: number; status: StrategyStatus; created_at: string; approved_at?: string; change_note?: string }[] {
  return [...f.versions].reverse().map((v) => ({
    version: v.version,
    status: v.status,
    created_at: v.created_at,
    ...(v.approved_at ? { approved_at: v.approved_at } : {}),
    ...(v.change_note ? { change_note: v.change_note } : {}),
  }));
}
