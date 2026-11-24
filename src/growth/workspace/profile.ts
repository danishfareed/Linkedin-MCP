import { invalidInput } from "../../errors.js";
import { readJson, updateJson } from "../../state/store.js";
import { deepMerge, isPlainObject, nextId, pruneEmpty, unsetPath } from "./files.js";
import { type GrowthProfile, profileSchema } from "./schemas.js";

export interface ProfileFile {
  schema: 1;
  updated_at: string | null;
  profile: GrowthProfile;
}

const EMPTY: ProfileFile = { schema: 1, updated_at: null, profile: {} };

export async function readProfile(file: string): Promise<ProfileFile> {
  const raw = await readJson<ProfileFile>(file, EMPTY);
  const parsed = profileSchema.safeParse(raw.profile ?? {});
  // A hand-edited file that no longer validates is still returned, so nothing is lost; updates re-validate.
  return { schema: 1, updated_at: raw.updated_at ?? null, profile: parsed.success ? parsed.data : ((raw.profile ?? {}) as GrowthProfile) };
}

function sameItem(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Adds list items without replacing the list: `{ voice: { banned_words: ["synergy"] } }`
 * appends "synergy". Strings already present (any case) are skipped.
 */
export function appendLists(base: unknown, append: unknown, path = ""): unknown {
  if (!isPlainObject(append)) throw invalidInput(`append only adds to lists; ${path || "the value"} isn't a list. Use patch to set it.`);
  const out: Record<string, unknown> = isPlainObject(base) ? { ...base } : {};
  for (const [key, value] of Object.entries(append)) {
    if (value === undefined) continue;
    const here = path ? `${path}.${key}` : key;
    if (Array.isArray(value)) {
      const current = Array.isArray(out[key]) ? [...(out[key] as unknown[])] : [];
      for (const item of value) if (!current.some((c) => sameItem(c, item))) current.push(item);
      out[key] = current;
    } else if (isPlainObject(value)) {
      out[key] = appendLists(out[key], value, here);
    } else {
      throw invalidInput(`append only adds to lists; ${here} isn't a list. Use patch to set it.`);
    }
  }
  return out;
}

function withIds(profile: GrowthProfile): GrowthProfile {
  const out = { ...profile };
  if (out.goals) {
    const used = out.goals.map((g) => g.id);
    out.goals = out.goals.map((g) => {
      if (g.id) return g;
      const id = nextId("g", used);
      used.push(id);
      return { ...g, id };
    });
  }
  if (out.proof_bank) {
    const used = out.proof_bank.map((p) => p.id);
    out.proof_bank = out.proof_bank.map((p) => {
      if (p.id) return p;
      const id = nextId("p", used);
      used.push(id);
      return { ...p, id };
    });
  }
  return out;
}

export interface ProfileChange {
  patch?: GrowthProfile;
  append?: GrowthProfile;
  unset?: string[];
}

/** Applies patch (deep merge, lists replace), then append, then unset; validates; saves. */
export async function updateProfile(file: string, change: ProfileChange, now: Date): Promise<ProfileFile> {
  return updateJson<ProfileFile>(file, EMPTY, (current) => {
    let next = deepMerge<GrowthProfile>(current.profile ?? {}, change.patch ?? {});
    if (change.append) next = appendLists(next, change.append) as GrowthProfile;
    next = structuredClone(next);
    const missing = (change.unset ?? []).filter((p) => !unsetPath(next as Record<string, unknown>, p));
    if (missing.length) throw invalidInput(`Nothing to remove at ${missing.join(", ")}.`);
    next = withIds(pruneEmpty(next));
    const parsed = profileSchema.safeParse(next);
    if (!parsed.success) {
      throw invalidInput(`The profile isn't valid after this change: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }
    return { schema: 1, updated_at: now.toISOString(), profile: parsed.data };
  });
}

// --- Completeness ------------------------------------------------------------

type RuleState = "ok" | "weak" | "missing";

interface CompletenessRule {
  field: string;
  /** Needed before a strategy can be any good. */
  essential: boolean;
  weight: number;
  check: (p: GrowthProfile) => RuleState;
  question: string;
  why: string;
}

const count = (xs: unknown[] | undefined) => xs?.length ?? 0;
const atLeast = (n: number, ok: number, weak = 1): RuleState => (n >= ok ? "ok" : n >= weak ? "weak" : "missing");

/** What a good strategy needs, in order of importance. Data, so it is easy to change. */
export const COMPLETENESS_RULES: CompletenessRule[] = [
  {
    field: "offer.description",
    essential: true,
    weight: 3,
    check: (p) => (p.offer?.description ? "ok" : "missing"),
    question: "What do you sell, or what do you want LinkedIn to bring you (clients, a job, hires, speaking)?",
    why: "Every pillar and CTA points back to the offer.",
  },
  {
    field: "audience.who",
    essential: true,
    weight: 3,
    check: (p) => (p.audience?.who ? "ok" : "missing"),
    question: "Who exactly do you want reading your posts? Role, seniority, company type.",
    why: "Positioning and topics depend on the ideal reader.",
  },
  {
    field: "audience.pains",
    essential: true,
    weight: 3,
    check: (p) => atLeast(count(p.audience?.pains), 3),
    question: "What problems keep that reader up at night, in their own words? Aim for 3 or more.",
    why: "Pains become hooks and TOF topics.",
  },
  {
    field: "goals",
    essential: true,
    weight: 3,
    check: (p) => {
      const goals = p.goals ?? [];
      if (!goals.length) return "missing";
      return goals.some((g) => g.target !== undefined && g.due) ? "ok" : "weak";
    },
    question: "What should LinkedIn achieve for you, by when? A number and a date (e.g. 5,000 followers by 2027-06-30, 4 inbound leads a month).",
    why: "KPIs and the funnel mix come from the goal.",
  },
  {
    field: "proof_bank",
    essential: true,
    weight: 3,
    check: (p) => atLeast(count(p.proof_bank), 5),
    question: "Share stories, wins, numbers and case studies you can talk about, each with roughly when it happened and where it can be checked. Aim for 5 or more.",
    why: "Specific proof is what separates posts people trust from generic advice.",
  },
  {
    field: "identity.role",
    essential: true,
    weight: 2,
    check: (p) => (p.identity?.role ? "ok" : "missing"),
    question: "What's your role, and what do you actually do day to day?",
    why: "Credibility and point of view.",
  },
  {
    field: "posting_constraints",
    essential: true,
    weight: 2,
    check: (p) => {
      const c = p.posting_constraints;
      if (c?.hours_per_week !== undefined && count(c.days) > 0) return "ok";
      return c?.hours_per_week !== undefined || count(c?.days) > 0 ? "weak" : "missing";
    },
    question: "How many hours a week can you give LinkedIn, and which days can you post?",
    why: "Cadence must fit real life or it stops after two weeks.",
  },
  {
    field: "audience.desires",
    essential: false,
    weight: 2,
    check: (p) => atLeast(count(p.audience?.desires), 2),
    question: "What does your reader want to achieve? Two or three outcomes.",
    why: "Desires become MOF and BOF angles.",
  },
  {
    field: "audience.objections",
    essential: false,
    weight: 2,
    check: (p) => atLeast(count(p.audience?.objections), 2),
    question: "Why might your reader hesitate to buy from, hire or trust you?",
    why: "BOF posts answer objections.",
  },
  {
    field: "voice.samples",
    essential: false,
    weight: 2,
    check: (p) => atLeast(count(p.voice?.samples), 3),
    question: "Paste two or three things you wrote yourself (posts, emails, a talk) so drafts sound like you.",
    why: "Drafts match your voice instead of a generic one.",
  },
  {
    field: "voice.tone_words",
    essential: false,
    weight: 1,
    check: (p) => atLeast(count(p.voice?.tone_words), 3),
    question: "Three words for how you want to sound (e.g. direct, warm, nerdy).",
    why: "Keeps tone consistent across drafts.",
  },
  {
    field: "voice.banned",
    essential: false,
    weight: 1,
    check: (p) => (count(p.voice?.banned_words) + count(p.voice?.banned_phrases) > 0 ? "ok" : "missing"),
    question: "Any words or phrases you never want to use?",
    why: "review_post fails drafts that use them.",
  },
  {
    field: "topics_to_avoid",
    essential: false,
    weight: 1,
    check: (p) => (count(p.topics_to_avoid) > 0 ? "ok" : "missing"),
    question: "Any topics you won't post about (politics, clients, your employer)?",
    why: "Keeps ideas inside safe ground.",
  },
  {
    field: "offer.call_to_action",
    essential: false,
    weight: 1,
    check: (p) => (p.offer?.call_to_action ? "ok" : "missing"),
    question: "When someone is ready, what's the next step: book a call, DM you, visit a page, apply?",
    why: "The top of the CTA ladder.",
  },
  {
    field: "visuals",
    essential: false,
    weight: 1,
    check: (p) => {
      const v = p.visuals;
      const parts = [v?.colors?.primary, v?.fonts?.heading ?? v?.fonts?.body, v?.headshot_path ?? v?.logo_path].filter(Boolean).length;
      return parts === 3 ? "ok" : parts > 0 ? "weak" : "missing";
    },
    question: "For images and carousels: your brand colour (hex), font, and a path to a headshot or logo.",
    why: "Only needed for generated visuals.",
  },
];

export interface Completeness {
  score: number;
  ready_for_strategy: boolean;
  missing: { field: string; essential: boolean; question: string; why: string }[];
  weak: { field: string; essential: boolean; question: string; why: string }[];
  next_questions: string[];
}

export function profileCompleteness(p: GrowthProfile, rules: CompletenessRule[] = COMPLETENESS_RULES): Completeness {
  let earned = 0;
  let total = 0;
  const missing: Completeness["missing"] = [];
  const weak: Completeness["weak"] = [];
  let essentialMissing = false;
  for (const rule of rules) {
    total += rule.weight;
    const state = rule.check(p);
    const entry = { field: rule.field, essential: rule.essential, question: rule.question, why: rule.why };
    if (state === "ok") earned += rule.weight;
    else if (state === "weak") {
      earned += rule.weight / 2;
      weak.push(entry);
    } else {
      missing.push(entry);
      if (rule.essential) essentialMissing = true;
    }
  }
  const ordered = [...missing.filter((m) => m.essential), ...weak.filter((w) => w.essential), ...missing.filter((m) => !m.essential), ...weak.filter((w) => !w.essential)];
  return {
    score: Math.round((earned / total) * 100),
    ready_for_strategy: !essentialMissing,
    missing,
    weak,
    next_questions: ordered.slice(0, 3).map((r) => r.question),
  };
}
