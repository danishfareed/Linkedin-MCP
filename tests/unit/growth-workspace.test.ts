import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addSlots, classifyMedia, formatFromMedia, readCalendar, scheduleInput, slotNextStep, slotView, updateSlot } from "../../src/growth/workspace/calendar.js";
import { deepMerge, growthFiles, nextId, writeTextAtomic } from "../../src/growth/workspace/files.js";
import { addIdeas, advanceIdea, advanceStatus, archiveIdeas, filterIdeas, ideaScore, readIdeas, updateIdea } from "../../src/growth/workspace/ideas.js";
import { renderStrategyMarkdown } from "../../src/growth/workspace/markdown.js";
import { appendLists, profileCompleteness, readProfile, updateProfile } from "../../src/growth/workspace/profile.js";
import type { GrowthProfile, IdeaInput, StrategyDraft } from "../../src/growth/workspace/schemas.js";
import { approveStrategy, approvedVersion, archiveStrategy, checkForApproval, latestDraft, readStrategy, saveDraft } from "../../src/growth/workspace/strategy.js";
import { tempDir } from "./helpers.js";

const FIXTURES = join(import.meta.dirname, "..", "fixtures");
const json = <T>(name: string): T => JSON.parse(readFileSync(join(FIXTURES, name), "utf8")) as T;
const fullProfile = () => json<GrowthProfile>("growth-profile.json");
const fullStrategy = () => json<StrategyDraft>("growth-strategy.json");
const NOW = new Date(2026, 10, 24, 10, 0);
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

function files() {
  return growthFiles(join(tempDir(), "growth"));
}

const ownerOnly = (path: string) => process.platform === "win32" || (statSync(path).mode & 0o077) === 0;

describe("helpers", () => {
  it("deep-merges objects, replaces lists, ignores undefined", () => {
    expect(deepMerge({ a: { b: 1, c: [1, 2] }, d: 1 }, { a: { c: [3] }, d: undefined })).toEqual({ a: { b: 1, c: [3] }, d: 1 });
  });

  it("finds the next free id", () => {
    expect(nextId("p", ["p1", "p3", undefined, "x9"])).toBe("p4");
    expect(nextId("slot-", [])).toBe("slot-1");
  });

  it("writes text files owner-only", async () => {
    const path = join(tempDir(), "deep", "strategy.md");
    await writeTextAtomic(path, "# hi\n");
    expect(readFileSync(path, "utf8")).toBe("# hi\n");
    expect(ownerOnly(path)).toBe(true);
  });
});

describe("growth profile", () => {
  it("starts empty with the essential questions to ask", async () => {
    const f = files();
    const p = await readProfile(f.profile);
    expect(p.profile).toEqual({});
    const c = profileCompleteness(p.profile);
    expect(c.ready_for_strategy).toBe(false);
    expect(c.score).toBe(0);
    expect(c.next_questions).toHaveLength(3);
    expect(c.missing.filter((m) => m.essential).map((m) => m.field)).toEqual(expect.arrayContaining(["offer.description", "audience.who", "goals", "proof_bank"]));
  });

  it("saves a full brand book owner-only, assigns ids and reports it complete", async () => {
    const f = files();
    const saved = await updateProfile(f.profile, { patch: fullProfile() }, NOW);
    expect(saved.profile.proof_bank!.map((p) => p.id)).toEqual(["p1", "p2", "p3", "p4", "p5"]);
    expect(saved.profile.goals!.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(saved.updated_at).toBe(NOW.toISOString());
    expect(ownerOnly(f.profile)).toBe(true);
    expect(JSON.parse(readFileSync(f.profile, "utf8")).profile.identity.role).toBe("Fractional COO"); // readable JSON
    const c = profileCompleteness(saved.profile);
    expect(c).toMatchObject({ score: 100, ready_for_strategy: true, missing: [], weak: [] });
  });

  it("merges patches, appends without duplicates, and unsets paths", async () => {
    const f = files();
    await updateProfile(f.profile, { patch: { voice: { banned_words: ["synergy"], tone_words: ["direct"] } } }, NOW);
    await updateProfile(f.profile, { patch: { voice: { tone_words: ["warm"] } } }, NOW);
    let p = (await readProfile(f.profile)).profile;
    expect(p.voice).toEqual({ banned_words: ["synergy"], tone_words: ["warm"] });

    await updateProfile(f.profile, { append: { voice: { banned_words: ["Synergy", "leverage"] } } }, NOW);
    p = (await readProfile(f.profile)).profile;
    expect(p.voice!.banned_words).toEqual(["synergy", "leverage"]);

    await updateProfile(f.profile, { unset: ["voice.tone_words"] }, NOW);
    expect((await readProfile(f.profile)).profile.voice).toEqual({ banned_words: ["synergy", "leverage"] });
    await expect(updateProfile(f.profile, { unset: ["nope.nothing"] }, NOW)).rejects.toThrow(/Nothing to remove/);
  });

  it("keeps proof ids stable when appending", async () => {
    const f = files();
    await updateProfile(f.profile, { patch: { proof_bank: fullProfile().proof_bank!.slice(0, 2) } }, NOW);
    const next = await updateProfile(f.profile, { append: { proof_bank: [{ kind: "win", title: "New logo", date: "2026-10", source: "CRM" }] } }, NOW);
    expect(next.profile.proof_bank!.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("rejects appending to a non-list and invalid values", async () => {
    expect(() => appendLists({}, { identity: { role: "CEO" } })).toThrow(/isn't a list/);
    const f = files();
    await expect(updateProfile(f.profile, { patch: { visuals: { colors: { primary: "blue" } } } as GrowthProfile }, NOW)).rejects.toThrow(/hex colour/);
  });

  it("marks partial answers as weak", () => {
    const c = profileCompleteness({ audience: { who: "Founders", pains: ["churn"] }, goals: [{ type: "followers", description: "grow" }] });
    expect(c.weak.map((w) => w.field)).toEqual(expect.arrayContaining(["audience.pains", "goals"]));
  });
});

describe("growth strategy", () => {
  it("lists what blocks approval for an incomplete draft", () => {
    const check = checkForApproval({ positioning: "x", pillars: fullStrategy().pillars!.slice(0, 2) }, { now: NOW });
    expect(check.blocking.join("\n")).toMatch(/3 to 5 content pillars/);
    expect(check.blocking.join("\n")).toMatch(/shares add up to 75%/);
    expect(check.blocking.join("\n")).toMatch(/kpis/);
    expect(check.blocking.join("\n")).toMatch(/review_date/);
  });

  it("passes the full fixture, with warnings for unknown proof ids", () => {
    const check = checkForApproval(fullStrategy(), { now: NOW, profile: {} });
    expect(check.blocking).toEqual([]);
    expect(check.warnings.join()).toMatch(/proof ids not in the proof bank/);
    expect(checkForApproval(fullStrategy(), { now: new Date(2027, 2, 1), profile: {} }).blocking.join()).toMatch(/must be in the future/);
  });

  it("keeps every version and never overwrites the approved one without replace_approved", async () => {
    const f = files();
    const v1 = await saveDraft(f.strategy, { strategy: { positioning: "First take" }, base: "latest" }, NOW);
    expect(v1.saved).toMatchObject({ version: 1, status: "draft" });

    const v2 = await saveDraft(f.strategy, { strategy: fullStrategy(), base: "latest", change_note: "filled in" }, later(1));
    expect(v2.saved).toMatchObject({ version: 2, status: "draft", based_on: 1, change_note: "filled in" });
    expect(v2.file.versions[0]!.status).toBe("superseded");

    await expect(approveStrategy(f.strategy, { version: 1, replace_approved: false }, later(2))).rejects.toThrow(/only a draft can be approved/);
    const a = await approveStrategy(f.strategy, { replace_approved: false }, later(2));
    expect(a.approved).toMatchObject({ version: 2, status: "approved" });

    const v3 = await saveDraft(f.strategy, { strategy: { cadence: { posts_per_week: 4 } }, base: "approved" }, later(3));
    expect(v3.saved.strategy.cadence).toEqual({ posts_per_week: 4, days: ["mon", "wed", "fri"], time_windows: [{ start: "08:00", end: "10:00" }] });
    expect(v3.saved.strategy.positioning).toBe(fullStrategy().positioning);
    expect(approvedVersion(v3.file)!.version).toBe(2);

    const err = await approveStrategy(f.strategy, { replace_approved: false }, later(4)).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INVALID_INPUT", message: "Version 2 is the approved strategy." });
    const replaced = await approveStrategy(f.strategy, { replace_approved: true }, later(4));
    expect(replaced.approved.version).toBe(3);
    const s = await readStrategy(f.strategy);
    expect(s.versions.map((v) => [v.version, v.status])).toEqual([
      [1, "superseded"],
      [2, "superseded"],
      [3, "approved"],
    ]);
    expect(ownerOnly(f.strategy)).toBe(true);
  });

  it("refuses to approve an incomplete draft and lists why", async () => {
    const f = files();
    await saveDraft(f.strategy, { strategy: { positioning: "x" }, base: "empty" }, NOW);
    const err = await approveStrategy(f.strategy, { replace_approved: false }, NOW).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "INVALID_INPUT" });
    expect((err as { details: { blocking: string[] } }).details.blocking.length).toBeGreaterThan(3);
  });

  it("archives versions, guarding the approved one", async () => {
    const f = files();
    await saveDraft(f.strategy, { strategy: fullStrategy(), base: "empty" }, NOW);
    await approveStrategy(f.strategy, { replace_approved: false }, NOW);
    await expect(archiveStrategy(f.strategy, { version: 1, replace_approved: false }, NOW)).rejects.toThrow(/approved strategy/);
    const r = await archiveStrategy(f.strategy, { version: 1, replace_approved: true }, NOW);
    expect(r.archived.status).toBe("archived");
    expect(approvedVersion(r.file)).toBeNull();
    await expect(archiveStrategy(f.strategy, { version: 9, replace_approved: true }, NOW)).rejects.toThrow(/doesn't exist/);
  });

  it("fills gaps through the fill hook and rejects invalid drafts", async () => {
    const f = files();
    const r = await saveDraft(f.strategy, { strategy: { cadence: { posts_per_week: 2 } }, base: "empty", fill: (d) => ({ draft: { ...d, cadence: { ...d.cadence, days: ["tue", "thu"] } }, notes: ["filled"] }) }, NOW);
    expect(r.saved.strategy.cadence!.days).toEqual(["tue", "thu"]);
    expect(r.notes).toEqual(["filled"]);
    await expect(saveDraft(f.strategy, { strategy: { review_date: "2027-02-30" }, base: "latest" }, NOW)).rejects.toThrow(/real calendar date/);
  });

  it("exports readable markdown with the approved strategy, the pending draft and history", async () => {
    const f = files();
    await saveDraft(f.strategy, { strategy: fullStrategy(), base: "empty" }, NOW);
    await approveStrategy(f.strategy, { replace_approved: false }, NOW);
    const s = (await saveDraft(f.strategy, { strategy: { notes: "Try polls" }, base: "approved" }, NOW)).file;
    const profile = (await updateProfile(f.profile, { patch: fullProfile() }, NOW)).profile;
    const md = renderStrategyMarkdown(s, profile, NOW);
    expect(md).toMatch(/^# LinkedIn growth strategy/);
    expect(md).toContain("## Approved strategy (v1");
    expect(md).toContain("## Draft v2 (not approved)");
    expect(md).toContain("| Onboarding teardown | TOF | 40% |");
    expect(md).toContain("p1 (Acme Logistics onboarding 14 days to 3)");
    expect(md).toContain("TOF 40% · MOF 35% · BOF 25%");
    expect(md).toContain("| v2 | draft |");
    expect(latestDraft(s)!.version).toBe(2);
  });
});

const idea = (over: Partial<IdeaInput> = {}): IdeaInput => ({
  thesis: "Most onboarding can lose half its steps",
  pillar: "Onboarding teardown",
  funnel_stage: "TOF",
  method: "listicle",
  hooks: ["Delete these 3 onboarding steps.", "Your onboarding has 11 steps. It needs 5."],
  evidence: { needed: "Acme before/after", available: true, proof_refs: ["p1"] },
  source: { type: "own_story" },
  scores: { audience_fit: 5, proof_strength: 4, novelty: 3, effort: 2 },
  ...over,
});

describe("ideas", () => {
  it("scores 0-100 only when all four scores are set", () => {
    expect(ideaScore({ audience_fit: 5, proof_strength: 5, novelty: 5, effort: 1 })).toBe(100);
    expect(ideaScore({ audience_fit: 1, proof_strength: 1, novelty: 1, effort: 5 })).toBe(0);
    expect(ideaScore({ audience_fit: 5, proof_strength: 4, novelty: 3, effort: 2 })).toBe(75);
    expect(ideaScore({ audience_fit: 5 })).toBeNull();
  });

  it("adds, filters, sorts, updates and archives ideas", async () => {
    const f = files();
    const added = await addIdeas(f.ideas, [idea(), idea({ thesis: "Churn starts in week one", pillar: "Retention numbers", funnel_stage: "MOF", scores: { audience_fit: 3, proof_strength: 3, novelty: 3, effort: 3 } })], NOW);
    expect(added.map((i) => [i.id, i.status, i.score_total])).toEqual([
      ["idea-1", "new", 75],
      ["idea-2", "new", 50],
    ]);
    const all = (await readIdeas(f.ideas)).ideas;
    expect(filterIdeas(all, { pillar: "retention numbers" }).ideas.map((i) => i.id)).toEqual(["idea-2"]);
    expect(filterIdeas(all, { query: "half its STEPS" }).ideas.map((i) => i.id)).toEqual(["idea-1"]);
    expect(filterIdeas(all, { query: "11 steps" }).ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2"]); // hooks are searched too
    expect(filterIdeas(all, { sort: "newest" }).ideas[0]!.id).toBe("idea-2");
    expect(filterIdeas(all, {}).ideas.map((i) => i.id)).toEqual(["idea-1", "idea-2"]);

    const u = await updateIdea(f.ideas, "idea-2", { status: "dropped", scores: { novelty: 5 } }, later(5));
    expect(u).toMatchObject({ status: "dropped", score_total: 63, created_at: NOW.toISOString(), updated_at: later(5).toISOString() });
    await expect(updateIdea(f.ideas, "idea-2", { hooks: ["only one"] }, NOW)).rejects.toThrow(/hooks/);
    await expect(updateIdea(f.ideas, "idea-9", { status: "new" }, NOW)).rejects.toThrow(/doesn't exist/);

    expect(await archiveIdeas(f.ideas, ["idea-1", "idea-7"], NOW)).toEqual({ archived: ["idea-1"], not_found: ["idea-7"] });
    const after = (await readIdeas(f.ideas)).ideas;
    expect(filterIdeas(after, {}).ideas.map((i) => i.id)).toEqual(["idea-2"]);
    expect(filterIdeas(after, { include_archived: true }).total_matching).toBe(2);
    expect(ownerOnly(f.ideas)).toBe(true);
  });

  it("moves status forward only", async () => {
    expect(advanceStatus("new", "scheduled")).toBe("scheduled");
    expect(advanceStatus("published", "drafted")).toBe("published");
    expect(advanceStatus("dropped", "published")).toBe("dropped");
    const f = files();
    await addIdeas(f.ideas, [idea()], NOW);
    expect((await advanceIdea(f.ideas, "idea-1", "drafted", NOW))!.status).toBe("drafted");
    expect(await advanceIdea(f.ideas, "idea-1", "new", NOW)).toBeNull();
  });
});

describe("calendar store", () => {
  it("adds slots with ids, updates and clears fields", async () => {
    const f = files();
    const [a, b] = await addSlots(f.calendar, [{ date: "2026-11-27", time: "08:00" }, { date: "2026-11-25", time: "08:00" }], "cadence", { pillar: "Onboarding teardown" }, NOW);
    expect([a!.id, b!.id]).toEqual(["slot-1", "slot-2"]);
    expect((await readCalendar(f.calendar)).slots.map((s) => s.id)).toEqual(["slot-2", "slot-1"]); // sorted by date
    const { slot } = await updateSlot(f.calendar, "slot-1", { draft_text: "Hello", notes: "n" }, ["pillar"], later(1));
    expect(slot).toMatchObject({ draft_text: "Hello", notes: "n", updated_at: later(1).toISOString() });
    expect(slot.pillar).toBeUndefined();
    await expect(updateSlot(f.calendar, "slot-9", {}, [], NOW)).rejects.toThrow(/doesn't exist/);
    expect(ownerOnly(f.calendar)).toBe(true);
  });

  it("splits media into images or one document, like schedule_post", () => {
    expect(classifyMedia(["/a.png", "/b.JPG"])).toEqual({ images: ["/a.png", "/b.JPG"], document: null });
    expect(classifyMedia(["/deck.pdf"])).toEqual({ images: [], document: "/deck.pdf" });
    expect(() => classifyMedia(["/deck.pdf", "/a.png"])).toThrow(/images or a document/);
    expect(() => classifyMedia(["/a.pdf", "/b.pdf"])).toThrow(/one document/);
    expect(formatFromMedia(["/deck.pdf"])).toBe("carousel");
    expect(formatFromMedia(["/a.png"])).toBe("image");
    expect(formatFromMedia(undefined)).toBe("text");
  });

  it("builds schedule_post input for drafted and ready slots only", () => {
    const base = { id: "slot-1", date: "2026-12-02", time: "08:30", origin: "manual" as const, created_at: "", updated_at: "" };
    expect(scheduleInput({ ...base, status: "planned" })).toBeNull();
    expect(scheduleInput({ ...base, status: "ready", draft_text: "Post", media_paths: ["/x/deck.pdf"], document_title: "Deck" })).toEqual({
      text: "Post",
      document: { path: "/x/deck.pdf", title: "Deck" },
      publish_at: "2026-12-02T08:30",
    });
    expect(scheduleInput({ ...base, status: "scheduled", draft_text: "Post" })).toBeNull();
    const view = slotView({ ...base, status: "ready", draft_text: "x".repeat(200) });
    expect(view).toMatchObject({ weekday: "wed", draft_characters: 200 });
    expect(String(view.draft_preview)).toHaveLength(140);
    expect(slotNextStep({ ...base, status: "ready" })).toMatch(/schedule_post/);
    expect(slotNextStep({ ...base, status: "published" })).toBeNull();
  });
});
