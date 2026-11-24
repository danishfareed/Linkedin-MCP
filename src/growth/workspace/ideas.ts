import { invalidInput } from "../../errors.js";
import { readJson, updateJson } from "../../state/store.js";
import { deepMerge, nextId } from "./files.js";
import { type Idea, type IdeaInput, type IdeaPatch, type IdeaStatus, ideaInputSchema } from "./schemas.js";

export interface IdeasFile {
  schema: 1;
  ideas: Idea[];
}

const EMPTY: IdeasFile = { schema: 1, ideas: [] };

export async function readIdeas(file: string): Promise<IdeasFile> {
  const raw = await readJson<IdeasFile>(file, EMPTY);
  return { schema: 1, ideas: Array.isArray(raw.ideas) ? raw.ideas : [] };
}

/**
 * 0-100 from the four 1-5 scores. Effort counts inversely (easy ideas score
 * higher). Null until all four are set, so a half-scored idea never outranks
 * a fully scored one by accident.
 */
export function ideaScore(scores: IdeaInput["scores"]): number | null {
  if (!scores) return null;
  const { audience_fit, proof_strength, novelty, effort } = scores;
  if (audience_fit === undefined || proof_strength === undefined || novelty === undefined || effort === undefined) return null;
  const raw = audience_fit + proof_strength + novelty + (6 - effort); // 4..20
  return Math.round(((raw - 4) / 16) * 100);
}

/** Status only moves forward through the publishing pipeline unless set explicitly. */
const PROGRESS: IdeaStatus[] = ["new", "drafted", "scheduled", "published"];

export function advanceStatus(current: IdeaStatus, to: IdeaStatus): IdeaStatus {
  if (current === "dropped") return current;
  return PROGRESS.indexOf(to) > PROGRESS.indexOf(current) ? to : current;
}

export async function addIdeas(file: string, inputs: IdeaInput[], now: Date): Promise<Idea[]> {
  const added: Idea[] = [];
  await updateJson<IdeasFile>(file, EMPTY, (raw) => {
    const ideas = Array.isArray(raw.ideas) ? [...raw.ideas] : [];
    const stamp = now.toISOString();
    for (const input of inputs) {
      const id = nextId("idea-", ideas.map((i) => i.id));
      const idea: Idea = { id, ...input, status: "new", score_total: ideaScore(input.scores), archived: false, created_at: stamp, updated_at: stamp };
      ideas.push(idea);
      added.push(idea);
    }
    return { schema: 1, ideas };
  });
  return added;
}

export async function updateIdea(file: string, id: string, patch: IdeaPatch, now: Date): Promise<Idea> {
  let updated: Idea | null = null;
  await updateJson<IdeasFile>(file, EMPTY, (raw) => {
    const ideas = Array.isArray(raw.ideas) ? [...raw.ideas] : [];
    const index = ideas.findIndex((i) => i.id === id);
    if (index < 0) throw invalidInput(`Idea ${id} doesn't exist.`);
    const { status, ...fields } = patch;
    const current = ideas[index]!;
    const merged = deepMerge<IdeaInput>(stripMeta(current), fields);
    const parsed = ideaInputSchema.safeParse(merged);
    if (!parsed.success) throw invalidInput(`The idea isn't valid after this change: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    updated = {
      ...current,
      ...parsed.data,
      status: status ?? current.status,
      score_total: ideaScore(parsed.data.scores),
      updated_at: now.toISOString(),
    };
    ideas[index] = updated;
    return { schema: 1, ideas };
  });
  return updated!;
}

/** Moves linked ideas forward when their calendar slot moves (drafted → scheduled → published). */
export async function advanceIdea(file: string, id: string, to: IdeaStatus, now: Date): Promise<Idea | null> {
  let changed: Idea | null = null;
  await updateJson<IdeasFile>(file, EMPTY, (raw) => {
    const ideas = Array.isArray(raw.ideas) ? [...raw.ideas] : [];
    const index = ideas.findIndex((i) => i.id === id);
    if (index < 0) return raw;
    const current = ideas[index]!;
    const status = advanceStatus(current.status, to);
    if (status === current.status) return raw;
    changed = { ...current, status, updated_at: now.toISOString() };
    ideas[index] = changed;
    return { schema: 1, ideas };
  });
  return changed;
}

export async function archiveIdeas(file: string, ids: string[], now: Date): Promise<{ archived: string[]; not_found: string[] }> {
  const archived: string[] = [];
  const notFound: string[] = [];
  await updateJson<IdeasFile>(file, EMPTY, (raw) => {
    const ideas = Array.isArray(raw.ideas) ? [...raw.ideas] : [];
    const stamp = now.toISOString();
    for (const id of ids) {
      const index = ideas.findIndex((i) => i.id === id);
      if (index < 0) {
        notFound.push(id);
        continue;
      }
      ideas[index] = { ...ideas[index]!, archived: true, archived_at: stamp, updated_at: stamp };
      archived.push(id);
    }
    return { schema: 1, ideas };
  });
  return { archived, not_found: notFound };
}

function stripMeta(idea: Idea): IdeaInput {
  const { id: _id, status: _s, score_total: _t, archived: _a, created_at: _c, updated_at: _u, archived_at: _x, ...input } = idea;
  return input;
}

export interface IdeaFilters {
  status?: IdeaStatus[];
  pillar?: string;
  funnel_stage?: string;
  method?: string;
  format?: string;
  source_type?: string;
  evidence_available?: boolean;
  query?: string;
  include_archived?: boolean;
  sort?: "score" | "newest" | "oldest";
  limit?: number;
}

const eq = (a: string | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export function filterIdeas(ideas: Idea[], f: IdeaFilters): { ideas: Idea[]; total_matching: number } {
  const q = f.query?.trim().toLowerCase();
  const out = ideas.filter((i) => {
    if (!f.include_archived && i.archived) return false;
    if (f.status?.length && !f.status.includes(i.status)) return false;
    if (f.pillar && !eq(i.pillar, f.pillar)) return false;
    if (f.funnel_stage && i.funnel_stage !== f.funnel_stage) return false;
    if (f.method && !eq(i.method, f.method)) return false;
    if (f.format && i.format !== f.format) return false;
    if (f.source_type && i.source?.type !== f.source_type) return false;
    if (f.evidence_available !== undefined && (i.evidence?.available ?? false) !== f.evidence_available) return false;
    if (q && ![i.thesis, ...i.hooks, i.notes ?? ""].some((t) => t.toLowerCase().includes(q))) return false;
    return true;
  });
  const sort = f.sort ?? "score";
  out.sort((a, b) => {
    if (sort === "newest") return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
    if (sort === "oldest") return a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
    return (b.score_total ?? -1) - (a.score_total ?? -1) || a.created_at.localeCompare(b.created_at);
  });
  return { ideas: out.slice(0, f.limit ?? 50), total_matching: out.length };
}

export function countByStatus(ideas: Idea[]): Record<IdeaStatus | "archived", number> {
  const counts: Record<IdeaStatus | "archived", number> = { new: 0, drafted: 0, scheduled: 0, published: 0, dropped: 0, archived: 0 };
  for (const i of ideas) {
    if (i.archived) counts.archived++;
    else counts[i.status]++;
  }
  return counts;
}
