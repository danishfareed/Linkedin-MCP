import { isAbsolute } from "node:path";
import { z } from "zod";
import { isFieldPath } from "./files.js";

/**
 * Schemas for the growth workspace: the brand book (profile), the strategy,
 * content ideas and the calendar. Everything is stored as readable JSON in
 * the growth folder. Tool inputs reuse these, so they avoid transforms (the
 * MCP SDK turns them into JSON Schema).
 */

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const weekday = z.enum(WEEKDAYS);

export const FUNNEL_STAGES = ["TOF", "MOF", "BOF"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export const funnelStage = z.enum(FUNNEL_STAGES).describe("TOF = reach and awareness, MOF = trust and consideration, BOF = conversion.");

/** Post formats. carousel = a PDF/PPTX document post. */
export const FORMATS = ["text", "image", "carousel", "video", "poll", "article", "newsletter"] as const;
export type Format = (typeof FORMATS)[number];
export const format = z.enum(FORMATS);

export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:MM, for example 08:30");

export const timeWindow = z
  .object({ start: hhmm, end: hhmm })
  .refine((w) => w.start < w.end, { message: "start must be before end (windows can't cross midnight)" })
  .describe("A local-time window, e.g. { start: '08:00', end: '10:00' }.");
export type TimeWindow = z.infer<typeof timeWindow>;

function validDay(s: string): boolean {
  const [y, m, d] = s.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine(validDay, { message: "Not a real calendar date" });

/** A year, month or day: "2021", "2021-06" or "2021-06-14". */
export const looseDate = z.string().regex(/^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/, "Use YYYY, YYYY-MM or YYYY-MM-DD");

const text = (max = 2000) => z.string().trim().min(1).max(max);
const list = (max = 50, itemMax = 300) => z.array(text(itemMax)).max(max);
const absolutePath = z.string().refine((p) => isAbsolute(p), { message: "Use an absolute path" });
const hexColor = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex colour like #0A66C2");

/** A dotted field path like voice.banned_words: lower-case field names only, never a prototype key. */
export const fieldPath = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/, "Use lower-case field names separated by dots, e.g. voice.banned_words")
  .refine(isFieldPath, { message: "prototype, constructor and __proto__ aren't field names" });

// --- Profile (brand book) ----------------------------------------------------

export const GOAL_TYPES = ["followers", "leads", "hiring", "job_search", "authority", "community", "other"] as const;

export const goalSchema = z.strictObject({
  id: z.string().max(20).optional().describe("Assigned automatically (g1, g2, …)."),
  type: z.enum(GOAL_TYPES),
  description: text(500).describe("What success looks like, in the user's words."),
  metric: text(100).optional().describe("How it is measured, e.g. 'followers', 'inbound DMs per month', 'interviews'."),
  target: z.number().optional(),
  baseline: z.number().optional().describe("Where it stands today."),
  due: isoDate.optional(),
});
export type Goal = z.infer<typeof goalSchema>;

export const PROOF_KINDS = ["story", "win", "number", "case_study", "testimonial", "credential", "failure"] as const;

export const proofSchema = z.strictObject({
  id: z.string().max(20).optional().describe("Assigned automatically (p1, p2, …). Strategy pillars and ideas refer to proof by this id."),
  kind: z.enum(PROOF_KINDS),
  title: text(200),
  detail: text(2000).optional().describe("The facts: what happened, numbers, who was involved (with permission)."),
  date: looseDate.describe("When it happened: YYYY, YYYY-MM or YYYY-MM-DD."),
  source: text(300).describe("Where it can be checked: a link, a document, a person, or 'own experience'."),
  shareable: z.boolean().optional().describe("False when it can't be named publicly (client confidentiality)."),
});
export type Proof = z.infer<typeof proofSchema>;

export const profileSchema = z
  .strictObject({
    identity: z
      .strictObject({
        name: text(120),
        headline: text(250),
        role: text(200),
        company: text(200),
        location: text(120),
        linkedin_url: text(300),
        bio: text(2000).describe("Who the user is, in a few sentences."),
        expertise: list(20),
      })
      .partial(),
    offer: z
      .strictObject({
        description: text(1000).describe("What the user sells or wants (product, service, role, job)."),
        outcome: text(500).describe("The result buyers or employers get."),
        price_point: text(100),
        call_to_action: text(200).describe("The next step a ready buyer takes, e.g. 'book a 20-minute call'."),
        url: text(300),
      })
      .partial(),
    audience: z
      .strictObject({
        who: text(500).describe("The ideal customer profile in one or two sentences."),
        roles: list(20),
        industries: list(20),
        company_size: text(100),
        seniority: text(100),
        pains: list(20).describe("Problems they feel, in their words."),
        desires: list(20).describe("Outcomes they want."),
        objections: list(20).describe("Why they hesitate to buy, hire or trust."),
      })
      .partial(),
    goals: z.array(goalSchema).max(10),
    proof_bank: z.array(proofSchema).max(100),
    voice: z
      .strictObject({
        samples: z.array(text(3000)).max(10).describe("Posts or paragraphs the user actually wrote."),
        tone_words: list(15, 40),
        phrases_used: list(30, 120).describe("Phrases the user really says."),
        banned_words: list(100, 60).describe("Words never to use. review_post fails drafts that contain them."),
        banned_phrases: list(100, 200),
        notes: text(1000),
      })
      .partial(),
    topics_to_avoid: list(30, 200),
    posting_constraints: z
      .strictObject({
        hours_per_week: z.number().min(0).max(40).describe("Time the user can spend on LinkedIn per week, writing and engaging."),
        days: z.array(weekday).max(7).describe("Days the user is willing to post."),
        time_windows: z.array(timeWindow).max(4),
        max_posts_per_week: z.number().int().min(0).max(14),
        notes: text(500),
      })
      .partial(),
    visuals: z
      .strictObject({
        colors: z.strictObject({ primary: hexColor, secondary: hexColor, accent: hexColor, background: hexColor, text: hexColor }).partial(),
        fonts: z.strictObject({ heading: text(100), body: text(100) }).partial(),
        logo_path: absolutePath,
        headshot_path: absolutePath,
        style_notes: text(500),
      })
      .partial()
      .describe("Used by the image and carousel renderer."),
  })
  .partial();
export type GrowthProfile = z.infer<typeof profileSchema>;

// --- Strategy ----------------------------------------------------------------

export const pillarSchema = z.object({
  name: text(80),
  description: text(500).optional(),
  funnel_stage: funnelStage,
  share_pct: z.number().min(0).max(100).describe("Share of posts, in percent. Pillars add up to 100."),
  example_angles: list(10, 300),
  proof_refs: list(20, 200).describe("Proof bank ids (p1, p2) or short descriptions of the proof this pillar draws on."),
});
export type Pillar = z.infer<typeof pillarSchema>;

export const KPI_METRICS = [
  "followers",
  "profile_viewers",
  "post_impressions",
  "search_appearances",
  "avg_impressions_per_post",
  "avg_engagement_rate",
  "avg_comment_rate",
  "posts_per_week",
  "manual",
] as const;
export type KpiMetric = (typeof KPI_METRICS)[number];

export const kpiSchema = z.object({
  name: text(120),
  metric: z
    .enum(KPI_METRICS)
    .describe("followers/profile_viewers/post_impressions/search_appearances come from the dashboard; rates are percentages (3 means 3%); manual is tracked by hand in current."),
  target: z.number(),
  baseline: z.number().optional().describe("Starting value. Defaults to the first value in the analytics history."),
  current: z.number().optional().describe("Only for manual KPIs (leads, calls booked, interviews)."),
  by: isoDate,
});
export type Kpi = z.infer<typeof kpiSchema>;

export const strategyDraftSchema = z
  .strictObject({
    positioning: text(1000).describe("For [audience] who [pain], [user] is the [category] who [unique proof/benefit]."),
    pillars: z.array(pillarSchema).max(5),
    funnel_mix: z
      .object({
        tof_pct: z.number().min(0).max(100),
        mof_pct: z.number().min(0).max(100),
        bof_pct: z.number().min(0).max(100),
        reasons: text(1000),
      })
      .partial(),
    cadence: z
      .object({
        posts_per_week: z.number().int().min(1).max(14),
        days: z.array(weekday).max(7),
        time_windows: z.array(timeWindow).max(4),
        source: z.enum(["user", "profile", "analytics", "default"]).describe("Where the days and windows came from."),
        notes: text(500),
      })
      .partial(),
    format_mix: z.array(z.object({ format, share_pct: z.number().min(0).max(100) })).max(FORMATS.length),
    engagement_plan: z
      .object({
        daily_minutes: z.number().int().min(0).max(240),
        target_accounts: list(50, 200).describe("Profile URLs or names to comment on regularly."),
        target_topics: list(20, 120),
        tactics: list(10, 300),
        notes: text(500),
      })
      .partial(),
    cta_ladder: z.array(z.object({ funnel_stage: funnelStage, cta: text(200), example: text(300).optional() })).max(10),
    kpis: z.array(kpiSchema).max(10),
    review_date: isoDate,
    notes: text(2000),
  })
  .partial();
export type StrategyDraft = z.infer<typeof strategyDraftSchema>;

// --- Ideas -------------------------------------------------------------------

export const IDEA_STATUSES = ["new", "drafted", "scheduled", "published", "dropped"] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number];

export const IDEA_SOURCES = ["own_story", "audience_question", "comment", "trend", "past_winner", "repurpose"] as const;

const score = z.number().int().min(1).max(5);

export const ideaFields = {
  thesis: text(500).describe("The one point the post makes."),
  pillar: text(80).optional(),
  funnel_stage: funnelStage.optional(),
  method: text(80).optional().describe("Writing method, e.g. story, listicle, contrarian, how-to, case study, framework, behind-the-scenes."),
  format: format.optional(),
  hooks: z.array(text(300)).min(2).max(4).describe("2 to 4 opening-line options."),
  evidence: z
    .object({
      needed: text(500).describe("The proof that would make it credible."),
      available: z.boolean(),
      proof_refs: list(10, 200).optional().describe("Proof bank ids."),
    })
    .optional(),
  source: z
    .object({
      type: z.enum(IDEA_SOURCES),
      detail: text(500).optional(),
      post_url: z.string().url().optional().describe("Required for repurpose; useful for past_winner and comment."),
    })
    .refine((s) => s.type !== "repurpose" || Boolean(s.post_url), { message: "A repurposed idea needs source.post_url" })
    .optional(),
  scores: z
    .object({
      audience_fit: score.describe("1-5: how much the ICP cares."),
      proof_strength: score.describe("1-5: how strong the evidence is."),
      novelty: score.describe("1-5: how fresh the angle is for this audience."),
      effort: score.describe("1-5: effort to produce (5 = most work)."),
    })
    .partial()
    .optional(),
  notes: text(1000).optional(),
};

export const ideaInputSchema = z.strictObject(ideaFields);
export type IdeaInput = z.infer<typeof ideaInputSchema>;

export const ideaPatchSchema = z.strictObject({ ...ideaFields, hooks: ideaFields.hooks.optional(), thesis: ideaFields.thesis.optional(), status: z.enum(IDEA_STATUSES).optional() });
export type IdeaPatch = z.infer<typeof ideaPatchSchema>;

export interface Idea extends IdeaInput {
  id: string;
  status: IdeaStatus;
  /** 0-100 from the four scores; null until all four are set. */
  score_total: number | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

// --- Calendar ----------------------------------------------------------------

export const SLOT_STATUSES = ["planned", "drafted", "ready", "scheduled", "published", "skipped"] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export interface SlotReview {
  score: number;
  ready_to_post: boolean;
  checked_at: string;
  top_fixes: string[];
}

export interface Slot {
  id: string;
  date: string;
  time: string;
  status: SlotStatus;
  origin: "cadence" | "manual";
  idea_id?: string;
  pillar?: string;
  funnel_stage?: FunnelStage;
  method?: string;
  format?: Format;
  draft_text?: string;
  media_paths?: string[];
  document_title?: string;
  review?: SlotReview;
  /** Set when the post was scheduled through schedule_post. */
  scheduled_for?: string;
  post_url?: string;
  published_at?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export const slotFields = {
  date: isoDate.optional(),
  time: hhmm.optional(),
  idea_id: z.string().max(20).optional(),
  pillar: text(80).optional(),
  funnel_stage: funnelStage.optional(),
  method: text(80).optional(),
  format: format.optional(),
  draft_text: z.string().min(1).max(3000).optional().describe("The post text. It is checked with review_post when attached."),
  media_paths: z.array(absolutePath).max(9).optional().describe("Absolute paths: up to 9 images, or one PDF/PPTX/DOCX for a carousel."),
  document_title: text(100).optional().describe("Title for a document (carousel) post."),
  status: z.enum(SLOT_STATUSES).optional(),
  scheduled_for: z.string().optional().describe("When LinkedIn's scheduler will publish it (ISO 8601), from schedule_post's result."),
  post_url: z.string().url().optional().describe("The post URL once it is live."),
  published_at: z.string().optional().describe("ISO 8601."),
  notes: text(1000).optional(),
};
