import { extname } from "node:path";
import { invalidInput } from "../../errors.js";
import { readJson, updateJson } from "../../state/store.js";
import { nextId } from "./files.js";
import type { Format, Slot, SlotReview, SlotStatus } from "./schemas.js";
import { type PlannedSlot, weekdayOfKey } from "./slots.js";

export interface CalendarFile {
  schema: 1;
  slots: Slot[];
}

const EMPTY: CalendarFile = { schema: 1, slots: [] };

const DOCUMENT_EXTS = new Set([".pdf", ".pptx", ".ppt", ".docx", ".doc"]);

export async function readCalendar(file: string): Promise<CalendarFile> {
  const raw = await readJson<CalendarFile>(file, EMPTY);
  return { schema: 1, slots: Array.isArray(raw.slots) ? raw.slots : [] };
}

function sortSlots(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`) || a.id.localeCompare(b.id));
}

/** Splits media paths into images or one document, as schedule_post expects. */
export function classifyMedia(paths: string[] | undefined): { images: string[]; document: string | null } {
  const images: string[] = [];
  const documents: string[] = [];
  for (const p of paths ?? []) (DOCUMENT_EXTS.has(extname(p).toLowerCase()) ? documents : images).push(p);
  if (documents.length > 1) throw invalidInput("A post can carry one document (carousel), not several.");
  if (documents.length && images.length) throw invalidInput("A post can have images or a document, not both.");
  return { images, document: documents[0] ?? null };
}

/** The format implied by attached media. */
export function formatFromMedia(paths: string[] | undefined): Format {
  const m = classifyMedia(paths);
  if (m.document) return "carousel";
  if (m.images.length) return "image";
  return "text";
}

/** A slot to add: its date and time, plus fields for this slot only (they win over the shared ones). */
export type NewSlot = (PlannedSlot | { date: string; time: string }) & { fields?: Partial<Slot> };

/** Adds slots in one locked write, so a batch lands whole or not at all. */
export async function addSlots(file: string, planned: NewSlot[], origin: Slot["origin"], fields: Partial<Slot>, now: Date): Promise<Slot[]> {
  const added: Slot[] = [];
  await updateJson<CalendarFile>(file, EMPTY, (raw) => {
    const slots = Array.isArray(raw.slots) ? [...raw.slots] : [];
    const stamp = now.toISOString();
    for (const p of planned) {
      const own = { ...fields, ...p.fields };
      const slot: Slot = { ...own, id: nextId("slot-", slots.map((s) => s.id)), date: p.date, time: p.time, status: own.status ?? "planned", origin, created_at: stamp, updated_at: stamp };
      slots.push(slot);
      added.push(slot);
    }
    return { schema: 1, slots: sortSlots(slots) };
  });
  return added;
}

export type SlotPatch = Partial<Omit<Slot, "id" | "created_at" | "updated_at" | "origin">>;

/** The only fields a patch may set. Anything else in a patch is ignored. */
const PATCHABLE = new Set<string>(["date", "time", "status", "idea_id", "pillar", "funnel_stage", "method", "format", "draft_text", "media_paths", "document_title", "review", "scheduled_for", "post_url", "published_at", "notes"]);

/** Fields `clear` may remove. */
export const CLEARABLE = ["idea_id", "pillar", "funnel_stage", "method", "format", "draft_text", "media_paths", "document_title", "scheduled_for", "post_url", "published_at", "notes", "review"] as const;
export type ClearableField = (typeof CLEARABLE)[number];

/**
 * Applies a patch to one slot. `derive` runs on the merged slot (before
 * saving) so callers can set the status or a review from the result.
 */
export async function updateSlot(file: string, id: string, patch: SlotPatch, clear: ClearableField[], now: Date, derive?: (slot: Slot, previous: Slot) => Slot): Promise<{ slot: Slot; previous: Slot }> {
  let result: { slot: Slot; previous: Slot } | null = null;
  await updateJson<CalendarFile>(file, EMPTY, (raw) => {
    const slots = Array.isArray(raw.slots) ? [...raw.slots] : [];
    const index = slots.findIndex((s) => s.id === id);
    if (index < 0) throw invalidInput(`Calendar slot ${id} doesn't exist.`);
    const previous = slots[index]!;
    let slot: Slot = { ...previous };
    for (const field of clear) delete slot[field];
    slot = { ...slot, ...Object.fromEntries(Object.entries(patch).filter(([k, v]) => PATCHABLE.has(k) && v !== undefined)), updated_at: now.toISOString() };
    if (slot.media_paths) classifyMedia(slot.media_paths);
    if (derive) slot = derive(slot, previous);
    slots[index] = slot;
    result = { slot, previous };
    return { schema: 1, slots: sortSlots(slots) };
  });
  return result!;
}

export function slotsBetween(slots: Slot[], from: string, to: string, statuses?: SlotStatus[]): Slot[] {
  return sortSlots(slots).filter((s) => s.date >= from && s.date <= to && (!statuses?.length || statuses.includes(s.status)));
}

/**
 * What to pass to schedule_post for a slot with a draft. The assistant still
 * calls schedule_post, which returns a preview the user has to approve.
 */
export function scheduleInput(slot: Slot): Record<string, unknown> | null {
  if (!slot.draft_text) return null;
  if (!["drafted", "ready"].includes(slot.status)) return null;
  const media = classifyMedia(slot.media_paths);
  return {
    text: slot.draft_text,
    ...(media.images.length ? { images: media.images } : {}),
    ...(media.document ? { document: { path: media.document, title: slot.document_title ?? "Document" } } : {}),
    publish_at: `${slot.date}T${slot.time}`,
  };
}

/** A slot as tools return it: with its weekday, a short draft preview and the schedule_post input when it has a draft. */
export function slotView(slot: Slot, opts: { fullText?: boolean } = {}): Record<string, unknown> {
  const { draft_text, review, ...rest } = slot;
  const view: Record<string, unknown> = { ...rest, weekday: weekdayOfKey(slot.date) };
  if (draft_text) {
    view.draft_characters = [...draft_text].length;
    view[opts.fullText ? "draft_text" : "draft_preview"] = opts.fullText ? draft_text : draft_text.length > 140 ? `${draft_text.slice(0, 139)}…` : draft_text;
  }
  if (review) view.review = review as SlotReview;
  const input = scheduleInput(slot);
  if (input && opts.fullText) view.schedule_post_input = input;
  return view;
}

/** What still needs doing for a slot, in plain words. */
export function slotNextStep(slot: Slot): string | null {
  switch (slot.status) {
    case "planned":
      return slot.idea_id ? "Write the draft and attach it with draft_text." : "Assign an idea (idea_id) or write a draft.";
    case "drafted":
      if (slot.review && !slot.review.ready_to_post) return "Fix the review issues, then attach the revised draft.";
      return "Check the draft with the user, then set status ready.";
    case "ready":
      return "Call schedule_post with schedule_post_input, show the preview, and confirm only after the user approves. Then store scheduled_for here.";
    default:
      return null;
  }
}
