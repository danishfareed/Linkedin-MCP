import { promises as fs } from "node:fs";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { Nav } from "../browser/session.js";
import { type AppContext, withBrowser } from "../context.js";
import { LinkedInMcpError, invalidInput, toMcpError } from "../errors.js";
import { type HistoryRecord, type PostSnapshot, isRepost, latestByPost, postSnapshot, profileSnapshot, readHistory, saveSnapshots, withPostAnalytics } from "../growth/analytics/history.js";
import { buildReport, matchSlot, suggestedWindows } from "../growth/analytics/insights.js";
import { type ReviewContext, type ReviewResult, reviewBases, reviewPost } from "../growth/review/review.js";
import { CLEARABLE, type SlotPatch, addSlots, readCalendar, scheduleInput, slotNextStep, slotView, slotsBetween, updateSlot } from "../growth/workspace/calendar.js";
import { growthFiles, writeTextAtomic } from "../growth/workspace/files.js";
import { addIdeas, advanceIdea, archiveIdeas, countByStatus, filterIdeas, readIdeas, updateIdea } from "../growth/workspace/ideas.js";
import { renderStrategyMarkdown } from "../growth/workspace/markdown.js";
import { profileCompleteness, readProfile, updateProfile } from "../growth/workspace/profile.js";
import {
  FORMATS,
  type Format,
  FUNNEL_STAGES,
  type FunnelStage,
  type GrowthProfile,
  IDEA_SOURCES,
  IDEA_STATUSES,
  type IdeaStatus,
  type Pillar,
  SLOT_STATUSES,
  type Slot,
  type SlotStatus,
  type StrategyDraft,
  type TimeWindow,
  ideaInputSchema,
  ideaPatchSchema,
  isoDate,
  profileSchema,
  slotFields,
  strategyDraftSchema,
} from "../growth/workspace/schemas.js";
import { planSlots, spreadDays } from "../growth/workspace/slots.js";
import {
  type StrategyFile,
  activeStrategy,
  approveStrategy,
  approvedVersion,
  archiveStrategy,
  checkForApproval,
  historySummary,
  latestDraft,
  readStrategy,
  saveDraft,
} from "../growth/workspace/strategy.js";
import type { Metric } from "../linkedin/parse/analytics.js";
import type { PostList } from "../linkedin/pages/feed.js";
import { readMyPosts } from "../linkedin/pages/feed.js";
import { readProfileAnalytics } from "../linkedin/pages/lists.js";
import { type PostAnalytics, readPostAnalytics } from "../linkedin/pages/post.js";
import { readMyProfile } from "../linkedin/pages/profile.js";
import { addLocalDays, dayKeyToDate, localDayKey } from "../util/time.js";
import { READ, LOCAL, defineTool } from "./registry.js";

/**
 * The growth workspace: brand book, strategy, ideas, calendar, a draft
 * checker and the analytics feedback loop. Everything is stored locally in
 * the growth folder. None of these tools sends anything to LinkedIn;
 * growth_report only reads (with the usual page-load caps).
 */

/** Local and read-only: works in read-only mode and never touches LinkedIn. */
const LOCAL_READ: Omit<ToolAnnotations, "title"> = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const NEVER_SENDS = " Local only: this tool never sends anything to LinkedIn.";

/** The LinkedIn reads growth_report uses. Swappable in tests. */
export interface LinkedInReader {
  myPosts(nav: Nav, publicId: string, limit: number): Promise<PostList>;
  postAnalytics(nav: Nav, url: string): Promise<PostAnalytics>;
  profileAnalytics(nav: Nav): Promise<{ metrics: Record<string, Metric> }>;
  myProfile(nav: Nav): Promise<{ name: string | null; profile_url: string | null; public_id: string | null }>;
}

export const browserReader: LinkedInReader = {
  myPosts: readMyPosts,
  postAnalytics: readPostAnalytics,
  profileAnalytics: readProfileAnalytics,
  myProfile: (nav) => readMyProfile(nav, []),
};

/** Errors that end a report's browsing: the account or session needs attention. */
const STOP_CODES = new Set(["CHECKPOINT", "CIRCUIT_OPEN", "RATE_LIMITED", "NOT_LOGGED_IN", "LIMIT_REACHED", "BROWSER_UNAVAILABLE", "TIMEOUT", "NETWORK"]);

/** Time to keep in hand before starting another page load in growth_report. */
const RESERVE_MS = 12_000;

function files(ctx: AppContext) {
  return growthFiles(ctx.config.paths.growthDir);
}

async function myPublicId(ctx: AppContext, nav: Nav, reader: LinkedInReader): Promise<string> {
  const cached = (await ctx.account.get()).public_id;
  if (cached) return cached;
  const me = await reader.myProfile(nav);
  if (!me.public_id) throw new Error("Could not determine your profile username.");
  await ctx.account.update({ name: me.name, profile_url: me.profile_url, public_id: me.public_id });
  return me.public_id;
}

/** Rewrites strategy.md from strategy.json and the profile. */
async function exportStrategy(ctx: AppContext): Promise<string | null> {
  const f = files(ctx);
  const strategy = await readStrategy(f.strategy);
  if (!strategy.versions.length) return null;
  const profile = (await readProfile(f.profile)).profile;
  await writeTextAtomic(f.strategyMarkdown, renderStrategyMarkdown(strategy, profile, ctx.clock()));
  return f.strategyMarkdown;
}

/** First lines of recent posts and other drafts, newest first. */
async function recentOpenings(ctx: AppContext, excludeSlot?: string): Promise<{ text: string; source: string }[]> {
  const f = files(ctx);
  const [history, calendar] = await Promise.all([readHistory(f.history), readCalendar(f.calendar)]);
  const posts = latestByPost(history.records)
    .posts.filter((p) => p.first_line)
    .sort((a, b) => (b.posted_at ?? b.captured_at).localeCompare(a.posted_at ?? a.captured_at))
    .map((p) => ({ text: p.first_line!, source: `your post of ${(p.posted_at ?? p.captured_at).slice(0, 10)}` }));
  const drafts = calendar.slots
    .filter((s) => s.draft_text && s.id !== excludeSlot && s.status !== "skipped")
    .map((s) => ({ text: s.draft_text!.split("\n").find((l) => l.trim()) ?? "", source: `calendar ${s.id} (${s.date})` }));
  return [...posts, ...drafts].filter((o) => o.text.trim());
}

async function reviewContext(ctx: AppContext, base: ReviewContext, opts: { useProfile: boolean; compareHistory: boolean; excludeSlot?: string }): Promise<ReviewContext> {
  const out: ReviewContext = { ...base };
  if (opts.useProfile) {
    const p = (await readProfile(files(ctx).profile)).profile;
    out.banned_words = p.voice?.banned_words;
    out.banned_phrases = p.voice?.banned_phrases;
    out.topics_to_avoid = p.topics_to_avoid;
    out.voice_samples = p.voice?.samples;
  }
  if (opts.compareHistory) out.recent_openings = await recentOpenings(ctx, opts.excludeSlot);
  return out;
}

function slotReview(r: ReviewResult, now: Date): Slot["review"] {
  return { score: r.score, ready_to_post: r.ready_to_post, checked_at: now.toISOString(), top_fixes: r.top_fixes };
}

/** Fills cadence gaps from the profile (days) and the analytics history (time windows). */
function cadenceFiller(profile: GrowthProfile, suggestion: { windows: TimeWindow[]; evidence: string }) {
  return (draft: StrategyDraft): { draft: StrategyDraft; notes: string[] } => {
    if (!draft.cadence) return { draft, notes: [] };
    const notes: string[] = [];
    const c = { ...draft.cadence };
    const filled: ("profile" | "analytics")[] = [];
    const userGave = Boolean(c.days?.length || c.time_windows?.length);
    const pc = profile.posting_constraints;
    if (!c.days?.length && pc?.days?.length) {
      c.days = spreadDays(pc.days, c.posts_per_week ?? pc.days.length);
      filled.push("profile");
      notes.push(`cadence.days filled from the days you can post: ${c.days.join(", ")}.`);
    }
    if (!c.time_windows?.length) {
      if (suggestion.windows.length) {
        c.time_windows = suggestion.windows;
        filled.push("analytics");
        notes.push(`cadence.time_windows filled from your analytics history: ${suggestion.windows.map((w) => `${w.start}–${w.end}`).join(", ")} (${suggestion.evidence}).`);
      } else if (pc?.time_windows?.length) {
        c.time_windows = pc.time_windows;
        filled.push("profile");
        notes.push("cadence.time_windows filled from the times you said you can post. Not enough analytics history yet to suggest better windows.");
      }
    }
    if (!c.source) c.source = filled.includes("analytics") ? "analytics" : filled.includes("profile") ? (userGave ? "user" : "profile") : userGave ? "user" : "default";
    return { draft: { ...draft, cadence: c }, notes };
  };
}

/** Smooth weighted round-robin: spreads items by share across a sequence. */
function weightedSequence<T>(items: { item: T; share: number }[], count: number): T[] {
  const live = items.filter((i) => i.share > 0);
  if (!live.length) return [];
  const total = live.reduce((a, i) => a + i.share, 0);
  const current = live.map(() => 0);
  const out: T[] = [];
  for (let n = 0; n < count; n++) {
    let best = 0;
    for (let i = 0; i < live.length; i++) {
      current[i]! += live[i]!.share;
      if (current[i]! > current[best]!) best = i;
    }
    current[best]! -= total;
    out.push(live[best]!.item);
  }
  return out;
}

/** Notes for media paths that don't exist yet (schedule_post checks them again before anything is sent). */
async function missingMedia(paths: string[] | undefined): Promise<string[]> {
  const missing: string[] = [];
  for (const p of paths ?? []) {
    try {
      await fs.access(p);
    } catch {
      missing.push(`Media file not found yet: ${p}. schedule_post will refuse it until it exists.`);
    }
  }
  return missing;
}

function parseInstant(value: string | undefined, field: string): string | undefined {
  if (value === undefined) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw invalidInput(`${field} "${value}" isn't a valid date/time. Use ISO 8601, e.g. 2026-12-01T09:30.`);
  return d.toISOString();
}

const STATUS_FOR_IDEA: Partial<Record<SlotStatus, IdeaStatus>> = { drafted: "drafted", ready: "drafted", scheduled: "scheduled", published: "published" };

export function makeGrowthTools(reader: LinkedInReader = browserReader) {
  return [
    defineTool({
      name: "growth_profile",
      title: "Growth profile (brand book)",
      description:
        "Get or update the user's brand book for LinkedIn growth: identity and role, offer, ideal audience (who, pains, desires, objections), goals with targets and dates, " +
        "a proof bank of stories, wins, numbers and case studies (each with a date and a source), voice (writing samples, tone words, phrases, banned words), topics to avoid, " +
        "posting constraints (hours per week, days, time windows) and brand visuals (colours, fonts, logo and headshot paths for images and carousels). " +
        "update deep-merges `patch` (lists in a patch replace the stored list), adds list items with `append`, and removes fields with `unset` (dotted paths). " +
        "Every result includes completeness: what's missing for a good strategy, with next_questions to ask the user. Ask, don't invent: only store what the user said." +
        NEVER_SENDS,
      input: {
        action: z.enum(["get", "update"]).default("get"),
        patch: profileSchema.optional().describe("Fields to set. Objects merge; lists replace."),
        append: profileSchema.optional().describe("List items to add, e.g. { proof_bank: [...] } or { voice: { banned_words: ['synergy'] } }."),
        unset: z.array(z.string().min(1).max(100)).max(50).optional().describe("Dotted paths to remove, e.g. ['offer.price_point']."),
      },
      annotations: LOCAL,
      handler: async (args, ctx) => {
        const f = files(ctx);
        if (args.action === "update") {
          if (!args.patch && !args.append && !args.unset?.length) throw invalidInput("Give patch, append or unset to update the profile.");
          const saved = await updateProfile(f.profile, { patch: args.patch, append: args.append, unset: args.unset }, ctx.clock());
          const markdown = await exportStrategy(ctx);
          return { saved: true, updated_at: saved.updated_at, profile: saved.profile, completeness: profileCompleteness(saved.profile), file: f.profile, ...(markdown ? { strategy_markdown: markdown } : {}) };
        }
        const current = await readProfile(f.profile);
        return { updated_at: current.updated_at, profile: current.profile, completeness: profileCompleteness(current.profile), file: f.profile };
      },
    }),

    defineTool({
      name: "growth_strategy",
      title: "Growth strategy",
      description:
        "Get, save a draft of, approve, or archive the user's LinkedIn strategy: positioning, 3-5 content pillars (each with a funnel stage TOF/MOF/BOF, share %, example angles and the proof it draws on), " +
        "funnel mix with reasons, cadence (posts per week, days, time windows), format mix, engagement plan, CTA ladder, KPIs with targets and a review date. " +
        "save_draft merges `strategy` into the latest draft (or the approved one) and saves a new version; cadence gaps are filled from the profile and the analytics history. " +
        "approve needs approve: true and is only for after the user explicitly approved that version; an existing approved strategy is replaced only with replace_approved: true. " +
        "Every version is kept. strategy.md in the growth folder is a readable export for the user." +
        NEVER_SENDS,
      input: {
        action: z.enum(["get", "save_draft", "approve", "archive"]).default("get"),
        strategy: strategyDraftSchema.optional().describe("For save_draft: the fields to set. Objects merge, lists replace."),
        base: z.enum(["latest", "approved", "empty"]).default("latest").describe("save_draft starts from the latest draft (else the approved strategy), the approved strategy, or nothing."),
        change_note: z.string().min(1).max(300).optional().describe("What changed and why, kept in the version history."),
        version: z.number().int().min(1).optional().describe("approve: the draft version (default the latest draft). archive: required."),
        approve: z.boolean().optional().describe("Must be true to approve. Set it only after the user said yes to this version."),
        replace_approved: z.boolean().default(false).describe("Allow replacing or archiving the currently approved strategy. Only when the user asked for it."),
      },
      annotations: LOCAL,
      handler: async (args, ctx) => {
        const f = files(ctx);
        const now = ctx.clock();
        const profile = (await readProfile(f.profile)).profile;
        const view = async (file?: StrategyFile) => {
          const s = file ?? (await readStrategy(f.strategy));
          const approved = approvedVersion(s);
          const draft = latestDraft(s);
          const [history, calendar, ideas] = await Promise.all([readHistory(f.history), readCalendar(f.calendar), readIdeas(f.ideas)]);
          const hint = suggestedWindows(history.records, calendar.slots, ideas.ideas, now);
          return {
            approved: approved ? { version: approved.version, approved_at: approved.approved_at, strategy: approved.strategy } : null,
            draft: draft ? { version: draft.version, created_at: draft.created_at, based_on: draft.based_on, strategy: draft.strategy, approval_check: checkForApproval(draft.strategy, { now, profile }) } : null,
            history: historySummary(s),
            analytics_hint: hint.windows.length ? { suggested_time_windows: hint.windows, evidence: hint.evidence } : { note: hint.evidence },
            profile_completeness: profileCompleteness(profile),
            files: { json: f.strategy, markdown: f.strategyMarkdown },
          };
        };

        switch (args.action) {
          case "get":
            return view();
          case "save_draft": {
            if (!args.strategy) throw invalidInput("save_draft needs `strategy` with the fields to save.");
            const [history, calendar, ideas] = await Promise.all([readHistory(f.history), readCalendar(f.calendar), readIdeas(f.ideas)]);
            const hint = suggestedWindows(history.records, calendar.slots, ideas.ideas, now);
            const r = await saveDraft(f.strategy, { strategy: args.strategy, base: args.base, change_note: args.change_note, fill: cadenceFiller(profile, hint) }, now);
            await exportStrategy(ctx);
            return { saved_version: r.saved.version, status: "draft", fill_notes: r.notes, next_step: "Show the draft to the user. Approve only after they say yes, with approve: true.", ...(await view(r.file)) };
          }
          case "approve": {
            if (args.approve !== true) {
              throw new LinkedInMcpError("INVALID_INPUT", "Approving needs approve: true.", "Show the user the draft and ask. Only if they explicitly approve, call again with approve: true.");
            }
            const r = await approveStrategy(f.strategy, { version: args.version, replace_approved: args.replace_approved, profile }, now);
            const md = await exportStrategy(ctx);
            return { approved_version: r.approved.version, warnings: r.warnings, strategy_markdown: md, ...(await view(r.file)) };
          }
          case "archive": {
            if (args.version === undefined) throw invalidInput("archive needs `version`.");
            const r = await archiveStrategy(f.strategy, { version: args.version, replace_approved: args.replace_approved }, now);
            await exportStrategy(ctx);
            return { archived_version: r.archived.version, ...(await view(r.file)) };
          }
        }
      },
    }),

    defineTool({
      name: "growth_ideas",
      title: "Content ideas",
      description:
        "Add, list, update and archive content ideas. Each idea has a thesis, pillar, funnel stage, method (story, listicle, contrarian, how-to…), format, 2-4 hook options, " +
        "the evidence it needs and whether that's available, a source (own_story, audience_question, comment, trend, past_winner, or repurpose of a post_url), " +
        "a status (new, drafted, scheduled, published, dropped) and 1-5 scores (audience_fit, proof_strength, novelty, effort) that make score_total (0-100). " +
        "list filters by any of these and sorts by score by default. Archived ideas are hidden unless include_archived." +
        NEVER_SENDS,
      input: {
        action: z.enum(["add", "list", "update", "archive"]).default("list"),
        ideas: z.array(ideaInputSchema).min(1).max(20).optional().describe("add: 1-20 ideas."),
        idea_id: z.string().optional().describe("update: the idea to change."),
        patch: ideaPatchSchema.optional().describe("update: fields to change, including status."),
        ids: z.array(z.string()).min(1).max(50).optional().describe("archive: ideas to archive."),
        filters: z
          .object({
            status: z.array(z.enum(IDEA_STATUSES)).max(5),
            pillar: z.string(),
            funnel_stage: z.enum(FUNNEL_STAGES),
            method: z.string(),
            format: z.enum(FORMATS),
            source_type: z.enum(IDEA_SOURCES),
            evidence_available: z.boolean(),
            query: z.string().max(200).describe("Text to find in the thesis, hooks or notes."),
            include_archived: z.boolean(),
          })
          .partial()
          .optional(),
        sort: z.enum(["score", "newest", "oldest"]).default("score"),
        limit: z.number().int().min(1).max(200).default(50),
      },
      annotations: LOCAL,
      handler: async (args, ctx) => {
        const f = files(ctx);
        const now = ctx.clock();
        switch (args.action) {
          case "add": {
            if (!args.ideas?.length) throw invalidInput("add needs `ideas`.");
            const strategy = activeStrategy(await readStrategy(f.strategy));
            const pillars = new Set((strategy?.strategy.pillars ?? []).map((p) => p.name.toLowerCase()));
            const warnings: string[] = [];
            for (const i of args.ideas) {
              if (i.pillar && pillars.size && !pillars.has(i.pillar.toLowerCase())) warnings.push(`"${i.thesis.slice(0, 40)}": pillar "${i.pillar}" isn't in the strategy.`);
              if (i.evidence && !i.evidence.available) warnings.push(`"${i.thesis.slice(0, 40)}": evidence not available yet (${i.evidence.needed}).`);
            }
            const added = await addIdeas(f.ideas, args.ideas, now);
            return { added, warnings, file: f.ideas };
          }
          case "update": {
            if (!args.idea_id || !args.patch) throw invalidInput("update needs idea_id and patch.");
            return { idea: await updateIdea(f.ideas, args.idea_id, args.patch, now) };
          }
          case "archive": {
            if (!args.ids?.length) throw invalidInput("archive needs ids.");
            return await archiveIdeas(f.ideas, args.ids, now);
          }
          case "list": {
            const all = (await readIdeas(f.ideas)).ideas;
            const r = filterIdeas(all, { ...args.filters, sort: args.sort, limit: args.limit });
            return { ideas: r.ideas, total_matching: r.total_matching, complete: r.ideas.length === r.total_matching, counts: countByStatus(all) };
          }
        }
      },
    }),

    defineTool({
      name: "growth_calendar",
      title: "Content calendar",
      description:
        "Plan posts in a local calendar. generate creates slots for a date range from the strategy cadence (respecting the user's posting days and time windows; one post a day at most), " +
        "assigning pillars and formats by their shares, and suggests better time windows when the analytics history supports them. " +
        "add creates one slot; update assigns an idea, attaches draft text (checked with review_post automatically) and media paths, sets the status " +
        "(planned, drafted, ready, scheduled, published, skipped) and stores the scheduling result (scheduled_for or post_url). upcoming shows the next 14 days; list shows any range. " +
        "This tool never schedules or posts: for a ready slot, call schedule_post with its schedule_post_input, show the preview, and confirm only after the user approves." +
        NEVER_SENDS,
      input: {
        action: z.enum(["upcoming", "list", "generate", "add", "update"]).default("upcoming"),
        from: isoDate.optional().describe("generate/list: first day (default today)."),
        to: isoDate.optional().describe("generate: last day (default from + 13 days). list: default from + 30 days."),
        days: z.number().int().min(1).max(90).default(14).describe("upcoming: how many days ahead."),
        statuses: z.array(z.enum(SLOT_STATUSES)).max(6).optional().describe("list: only these statuses."),
        use_analytics_windows: z.boolean().default(false).describe("generate: use the best time windows from the analytics history when the sample supports them."),
        slot_id: z.string().optional().describe("update: the slot to change."),
        ...slotFields,
        clear: z.array(z.enum(CLEARABLE)).max(CLEARABLE.length).optional().describe("update: fields to remove from the slot."),
      },
      annotations: LOCAL,
      handler: async (args, ctx) => {
        const f = files(ctx);
        const now = ctx.clock();
        const today = localDayKey(now);
        switch (args.action) {
          case "upcoming": {
            const to = localDayKey(addLocalDays(now, args.days - 1));
            const slots = slotsBetween((await readCalendar(f.calendar)).slots, today, to);
            const counts = Object.fromEntries(SLOT_STATUSES.map((s) => [s, slots.filter((x) => x.status === s).length]));
            return {
              from: today,
              to,
              slots: slots.map((s) => ({ ...slotView(s), ...(s.status === "ready" ? { schedule_post_input: scheduleInput(s) } : {}) })),
              counts,
              needs_attention: slots.map((s) => ({ slot_id: s.id, date: s.date, next_step: slotNextStep(s) })).filter((x) => x.next_step),
            };
          }
          case "list": {
            const from = args.from ?? today;
            const to = args.to ?? localDayKey(addLocalDays(dayKeyToDate(from), 30));
            const slots = slotsBetween((await readCalendar(f.calendar)).slots, from, to, args.statuses);
            return { from, to, slots: slots.map((s) => slotView(s)) };
          }
          case "generate": {
            const from = args.from ?? today;
            const to = args.to ?? localDayKey(addLocalDays(dayKeyToDate(from), 13));
            if (to < from) throw invalidInput("`to` is before `from`.");
            if ((dayKeyToDate(to).getTime() - dayKeyToDate(from).getTime()) / 86_400_000 > 92) throw invalidInput("Generate at most about three months (92 days) at a time.");
            const [strategyFile, profileFile, calendar, history, ideas] = await Promise.all([readStrategy(f.strategy), readProfile(f.profile), readCalendar(f.calendar), readHistory(f.history), readIdeas(f.ideas)]);
            const active = activeStrategy(strategyFile);
            const profile = profileFile.profile;
            const notes: string[] = [];
            if (active?.status === "draft") notes.push(`No approved strategy yet; planned from draft v${active.version}.`);
            const cadence = active?.strategy.cadence;
            const perWeek = cadence?.posts_per_week ?? profile.posting_constraints?.max_posts_per_week;
            if (!perWeek) throw invalidInput("Set a cadence first: save a strategy with cadence.posts_per_week (growth_strategy), or posting_constraints.max_posts_per_week in the profile.");
            if (!cadence) notes.push("No strategy cadence; planned from the profile's posting constraints.");
            const hint = suggestedWindows(history.records, calendar.slots, ideas.ideas, now);
            let windows = cadence?.time_windows;
            if (args.use_analytics_windows) {
              if (hint.windows.length) {
                windows = hint.windows;
                notes.push(`Used time windows from your analytics: ${hint.evidence}.`);
              } else notes.push(`Kept the strategy's time windows: ${hint.evidence}`);
            }
            const plan = planSlots({
              from,
              to,
              posts_per_week: perWeek,
              days: cadence?.days,
              time_windows: windows,
              allowed_days: profile.posting_constraints?.days,
              allowed_windows: profile.posting_constraints?.time_windows,
              max_posts_per_week: profile.posting_constraints?.max_posts_per_week,
              existing: calendar.slots,
              now,
            });
            const pillars = weightedSequence<Pillar>((active?.strategy.pillars ?? []).map((p) => ({ item: p, share: p.share_pct })), plan.slots.length);
            const formats = weightedSequence<Format>((active?.strategy.format_mix ?? []).map((m) => ({ item: m.format, share: m.share_pct })), plan.slots.length);
            const created = await addSlots(
              f.calendar,
              plan.slots.map((p, i) => {
                const pillar = pillars[i];
                return { ...p, fields: { ...(pillar ? { pillar: pillar.name, funnel_stage: pillar.funnel_stage } : {}), ...(formats[i] ? { format: formats[i] } : {}) } };
              }),
              "cadence",
              {},
              now,
            );
            const differs = hint.windows.length && !args.use_analytics_windows && JSON.stringify(hint.windows) !== JSON.stringify(plan.windows_used);
            return {
              created: created.map((s) => slotView(s)),
              skipped: plan.skipped,
              notes: [...notes, ...plan.notes],
              days_used: plan.days_used,
              time_windows_used: plan.windows_used,
              ...(differs ? { suggested_time_windows: hint.windows, suggestion_evidence: hint.evidence, suggestion: "Your analytics favour these windows. Run generate again with use_analytics_windows: true (for new slots) or update slot times if the user agrees." } : {}),
            };
          }
          case "add": {
            if (!args.date || !args.time) throw invalidInput("add needs date and time.");
            if (args.date < today) throw invalidInput("That date is in the past.");
            const fields = await slotPatchFromArgs(ctx, args);
            const review = fields.draft_text ? await runReview(ctx, fields.draft_text, { funnel_stage: fields.funnel_stage, method: fields.method, has_media: Boolean(fields.media_paths?.length) }) : null;
            const [slot] = await addSlots(f.calendar, [{ date: args.date, time: args.time }], "manual", { ...fields, status: fields.status ?? (fields.draft_text ? "drafted" : "planned"), ...(review ? { review: slotReview(review, now) } : {}) }, now);
            await syncIdea(ctx, slot!);
            return { slot: slotView(slot!, { fullText: true }), ...(review ? { review } : {}), notes: await missingMedia(fields.media_paths), next_step: slotNextStep(slot!) };
          }
          case "update": {
            if (!args.slot_id) throw invalidInput("update needs slot_id.");
            const patch = await slotPatchFromArgs(ctx, args);
            if (args.date && args.date < today) throw invalidInput("That date is in the past.");
            const current = (await readCalendar(f.calendar)).slots.find((s) => s.id === args.slot_id);
            if (!current) throw invalidInput(`Calendar slot ${args.slot_id} doesn't exist.`);
            const text = patch.draft_text;
            const review = text
              ? await runReview(ctx, text, {
                  funnel_stage: patch.funnel_stage ?? current.funnel_stage,
                  method: patch.method ?? current.method,
                  has_media: Boolean((patch.media_paths ?? current.media_paths)?.length),
                  slot_id: current.id,
                })
              : null;
            const notes: string[] = [];
            const { slot } = await updateSlot(f.calendar, args.slot_id, patch, args.clear ?? [], now, (s) => {
              const next = { ...s };
              if (review) next.review = slotReview(review, now);
              if (!args.status) {
                if (patch.post_url) next.status = "published";
                else if (patch.scheduled_for) next.status = "scheduled";
                else if (text && next.status === "planned") next.status = "drafted";
              }
              if (next.status === "published" && !next.published_at && patch.post_url) next.published_at = now.toISOString();
              if (next.status === "ready" && next.review && !next.review.ready_to_post) notes.push("Marked ready although the last review found failing checks.");
              if (next.status === "ready" && !next.draft_text) notes.push("Marked ready without a draft.");
              return next;
            });
            await syncIdea(ctx, slot);
            notes.push(...(await missingMedia(patch.media_paths)));
            return { slot: slotView(slot, { fullText: true }), ...(review ? { review } : {}), notes, next_step: slotNextStep(slot) };
          }
        }
      },
    }),

    defineTool({
      name: "review_post",
      title: "Review a post draft",
      description:
        "Check a LinkedIn post draft with deterministic, explainable rules (no AI call). Returns a 0-100 score, pass/warn/fail checks each with a reason and a concrete fix, " +
        "and the hook as it appears before LinkedIn's '…see more' fold on desktop and mobile. Checks: character limit, hook length and fold, first-line strength, readability (Flesch), " +
        "sentence and paragraph length, whitespace, total length, specificity, 'you' vs 'I', machine-writing tells, hashtags, external links, engagement bait LinkedIn demotes, " +
        "CTA presence and fit with the funnel stage, the user's banned words and topics, and repeated openings vs recent posts. Thresholds are approximate; explain: true adds the basis for each." +
        NEVER_SENDS,
      input: {
        text: z.string().min(1).max(10_000).describe("The draft. Longer than 3,000 characters is allowed so the limit check can report it."),
        funnel_stage: z.enum(FUNNEL_STAGES).optional(),
        method: z.string().max(80).optional().describe("e.g. story, listicle, how-to; story posts get a looser 'I' ratio."),
        has_media: z.boolean().optional().describe("An image, carousel or video is attached (LinkedIn shows fewer lines above the fold)."),
        slot_id: z.string().optional().describe("A calendar slot this draft belongs to: its funnel stage, method and media fill gaps, and it is left out of the repeated-opening comparison."),
        use_profile: z.boolean().default(true).describe("Check the growth profile's banned words, phrases and topics."),
        compare_history: z.boolean().default(true).describe("Compare the opening with recent posts and other calendar drafts."),
        fold: z
          .object({
            desktop_chars: z.number().int().min(40).max(1000),
            desktop_lines_text_only: z.number().int().min(1).max(20),
            desktop_lines_with_media: z.number().int().min(1).max(20),
            desktop_chars_per_line: z.number().int().min(20).max(200),
            mobile_chars: z.number().int().min(40).max(1000),
            mobile_lines: z.number().int().min(1).max(20),
            mobile_chars_per_line: z.number().int().min(15).max(200),
          })
          .partial()
          .optional()
          .describe("Override the fold estimate if LinkedIn shows more or less than expected."),
        explain: z.boolean().default(false).describe("Include the basis and source of every threshold."),
      },
      annotations: LOCAL_READ,
      handler: async (args, ctx) => {
        let slot: Slot | undefined;
        if (args.slot_id) {
          slot = (await readCalendar(files(ctx).calendar)).slots.find((s) => s.id === args.slot_id);
          if (!slot) throw invalidInput(`Calendar slot ${args.slot_id} doesn't exist.`);
        }
        const base: ReviewContext = {
          funnel_stage: args.funnel_stage ?? slot?.funnel_stage,
          method: args.method ?? slot?.method,
          has_media: args.has_media ?? Boolean(slot?.media_paths?.length),
          fold: args.fold,
        };
        const context = await reviewContext(ctx, base, { useProfile: args.use_profile, compareHistory: args.compare_history, excludeSlot: slot?.id });
        const result = reviewPost(args.text, context);
        return args.explain ? { ...result, bases: reviewBases() } : result;
      },
    }),

    defineTool({
      name: "growth_report",
      title: "Growth report",
      description:
        "The feedback loop: reads the user's recent posts (and optionally the analytics page of the last few, and the profile dashboard) through the browser, appends dated snapshots to the local analytics history " +
        "(one per post per day), links published posts to calendar slots, and reports engagement rate and comment rate per post, best and worst pillars, methods, formats and hook types, " +
        "best weekdays and time windows, follower and profile-view trends, progress on strategy KPIs, and recommendations with confidence levels. Small samples are labelled 'directional only'. " +
        "offline: true uses only the stored history (no browser). Online it is read-only and counts against the usual page-load cap: about 1 page for posts, 1 for the dashboard and 1 per post analytics page.",
      input: {
        offline: z.boolean().default(false).describe("Use only the stored history; don't open LinkedIn."),
        posts: z.number().int().min(1).max(20).default(10).describe("How many recent posts to read."),
        post_analytics: z.number().int().min(0).max(5).default(3).describe("Also open the analytics page of this many recent posts (one page load each)."),
        profile_analytics: z.boolean().default(true).describe("Also read the dashboard (followers, profile viewers, impressions)."),
        window_days: z.number().int().min(7).max(365).default(90).describe("Analyse posts from this many days back."),
      },
      annotations: READ,
      handler: async (args, ctx) => {
        const f = files(ctx);
        const captured: HistoryRecord[] = [];
        const notes: string[] = [];
        let read = { posts: 0, reposts_skipped: 0, post_analytics: 0, profile: false, complete: true as boolean };

        if (!args.offline) {
          try {
            await withBrowser(ctx, async (nav) => {
              const publicId = await myPublicId(ctx, nav, reader);
              const list = await reader.myPosts(nav, publicId, args.posts);
              const now = ctx.clock();
              const own = list.posts.filter((p) => !isRepost(p));
              read = { ...read, posts: own.length, reposts_skipped: list.posts.length - own.length, complete: list.complete };
              if (!list.complete && list.note) notes.push(list.note);
              const snaps = own.map((p) => postSnapshot(p, now));
              captured.push(...snaps);

              const optional = async (what: string, step: () => Promise<void>): Promise<boolean> => {
                if (nav.deadline.remainingMs() < RESERVE_MS) {
                  notes.push(`Skipped ${what}: not enough time left in this call. Run growth_report again later to fill it in.`);
                  return false;
                }
                try {
                  await step();
                  return true;
                } catch (err) {
                  const e = toMcpError(err);
                  if (STOP_CODES.has(e.code)) throw err;
                  notes.push(`Couldn't read ${what}: ${e.message}`);
                  return true;
                }
              };

              if (args.profile_analytics) {
                await optional("the analytics dashboard", async () => {
                  const r = await reader.profileAnalytics(nav);
                  captured.push(profileSnapshot(r.metrics, ctx.clock()));
                  read.profile = true;
                });
              }
              const targets = [...snaps].filter((s) => s.url).sort((a, b) => (b.posted_at ?? "").localeCompare(a.posted_at ?? "")).slice(0, args.post_analytics);
              for (const s of targets) {
                const go = await optional(`analytics for ${s.url}`, async () => {
                  const a = await reader.postAnalytics(nav, s.url!);
                  const i = captured.indexOf(s);
                  captured[i] = withPostAnalytics(s, a.metrics);
                  read.post_analytics++;
                });
                if (!go) break;
              }
            });
          } catch (err) {
            const saved = await saveSnapshots(f.history, captured);
            const e = toMcpError(err);
            throw new LinkedInMcpError(e.code, e.message, e.nextStep, { ...e.details, saved_snapshots: saved.added + saved.updated, history_file: f.history });
          }
        }

        const saved = await saveSnapshots(f.history, captured);
        const linked = await linkPublished(ctx, captured.filter((r): r is PostSnapshot => r.kind === "post"));
        const [history, calendar, ideas, strategyFile] = await Promise.all([readHistory(f.history), readCalendar(f.calendar), readIdeas(f.ideas), readStrategy(f.strategy)]);
        if (history.skipped_lines) notes.push(`${history.skipped_lines} line(s) in the history file weren't valid snapshots and were ignored.`);
        const active = activeStrategy(strategyFile);
        const report = buildReport({
          records: history.records,
          slots: calendar.slots,
          ideas: ideas.ideas,
          strategy: active?.strategy ?? null,
          strategy_start: active?.approved_at ?? active?.created_at ?? null,
          now: ctx.clock(),
          window_days: args.window_days,
        });
        if (!history.records.length) notes.push("No analytics history yet. Run growth_report without offline to read your posts.");
        return {
          mode: args.offline ? "offline" : "live",
          ...(args.offline ? {} : { read, saved }),
          ...(linked.length ? { linked_calendar_slots: linked } : {}),
          strategy_version: active ? `${active.status} v${active.version}` : null,
          ...report,
          notes: [...notes, ...report.notes],
          history_file: f.history,
        };
      },
    }),
  ];

  /** Input fields shared by calendar add and update, validated against the stores. */
  async function slotPatchFromArgs(ctx: AppContext, args: z.infer<z.ZodObject<typeof slotFields>>): Promise<SlotPatch> {
    const patch: SlotPatch = {
      date: args.date,
      time: args.time,
      idea_id: args.idea_id,
      pillar: args.pillar,
      funnel_stage: args.funnel_stage as FunnelStage | undefined,
      method: args.method,
      format: args.format,
      draft_text: args.draft_text,
      media_paths: args.media_paths,
      document_title: args.document_title,
      status: args.status,
      scheduled_for: parseInstant(args.scheduled_for, "scheduled_for"),
      post_url: args.post_url,
      published_at: parseInstant(args.published_at, "published_at"),
      notes: args.notes,
    };
    if (args.idea_id) {
      const idea = (await readIdeas(files(ctx).ideas)).ideas.find((i) => i.id === args.idea_id);
      if (!idea) throw invalidInput(`Idea ${args.idea_id} doesn't exist.`);
      patch.pillar ??= idea.pillar;
      patch.funnel_stage ??= idea.funnel_stage;
      patch.method ??= idea.method;
      patch.format ??= idea.format;
    }
    return patch;
  }

  async function runReview(ctx: AppContext, text: string, base: ReviewContext & { slot_id?: string }): Promise<ReviewResult> {
    const { slot_id, ...rest } = base;
    return reviewPost(text, await reviewContext(ctx, rest, { useProfile: true, compareHistory: true, excludeSlot: slot_id }));
  }

  /** Moves the slot's idea forward with the slot (drafted → scheduled → published). */
  async function syncIdea(ctx: AppContext, slot: Slot): Promise<void> {
    const to = STATUS_FOR_IDEA[slot.status];
    if (slot.idea_id && to) await advanceIdea(files(ctx).ideas, slot.idea_id, to, ctx.clock());
  }

  /** Marks calendar slots as published when a post matching their draft shows up on LinkedIn. */
  async function linkPublished(ctx: AppContext, posts: PostSnapshot[]): Promise<{ slot_id: string; post_url: string }[]> {
    if (!posts.length) return [];
    const f = files(ctx);
    const slots = (await readCalendar(f.calendar)).slots;
    const linked: { slot_id: string; post_url: string }[] = [];
    for (const p of posts) {
      const m = matchSlot(p, slots);
      if (!m || m.by !== "text" || !p.url) continue;
      const { slot } = await updateSlot(f.calendar, m.slot.id, { post_url: p.url, status: "published", ...(p.posted_at ? { published_at: p.posted_at } : {}) }, [], ctx.clock());
      await syncIdea(ctx, slot);
      linked.push({ slot_id: slot.id, post_url: p.url });
      slots.splice(slots.indexOf(m.slot), 1, slot);
    }
    return linked;
  }
}

export const growthTools = makeGrowthTools();
