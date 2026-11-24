import type { Page } from "patchright";
import { describe, expect, it } from "vitest";
import { Deadline, currentDeadline, runWithDeadline } from "../../src/browser/deadline.js";
import { PER_CHAR_TYPING_MAX, Pacer, TYPING_RESERVE_MS, estimateKeyTypingMs, shouldTypeKeyByKey } from "../../src/browser/human.js";
import type { LinkedInMcpError } from "../../src/errors.js";
import { find, findOptional, waitForAny } from "../../src/linkedin/dom.js";
import { seededRng } from "./helpers.js";

/** A clock plus a sleep that advances it, so pacing runs instantly. */
function virtualTime(start = 1_000_000) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    sleeps,
  };
}

/** Records keyboard calls instead of typing. */
function fakeKeyboardPage() {
  const calls: string[] = [];
  const page = {
    keyboard: {
      type: async (ch: string) => void calls.push(`type:${ch}`),
      press: async (key: string) => void calls.push(`press:${key}`),
      insertText: async (text: string) => void calls.push(`insert:${text}`),
    },
    mouse: { wheel: async () => undefined },
  } as unknown as Page;
  return { page, calls };
}

function caught(fn: () => unknown): LinkedInMcpError {
  try {
    fn();
  } catch (err) {
    return err as LinkedInMcpError;
  }
  throw new Error("expected a throw");
}

describe("Deadline", () => {
  it("counts down and throws TIMEOUT with the stage once used up", () => {
    const t = virtualTime();
    const d = new Deadline(55_000, t.now);
    expect(d.remainingMs()).toBe(55_000);
    t.advance(50_000);
    expect(d.remainingMs()).toBe(5000);
    expect(d.clamp(15_000)).toBe(5000);
    expect(() => d.check("navigation")).not.toThrow();
    t.advance(5000);
    expect(d.expired()).toBe(true);
    const err = caught(() => d.check("navigation"));
    expect(err.code).toBe("TIMEOUT");
    expect(err.details).toMatchObject({ stage: "navigation", budget_ms: 55_000 });
    expect(err.message).toMatch(/55-second/);
  });

  it("keeps custom stage names from page code", () => {
    const t = virtualTime();
    const d = new Deadline(1000, t.now);
    t.advance(1000);
    expect(caught(() => d.check("opening the composer")).details).toMatchObject({ stage: "opening the composer" });
  });

  it("can be unlimited", () => {
    const d = Deadline.unlimited();
    expect(d.expired()).toBe(false);
    expect(d.clamp(15_000)).toBe(15_000);
  });
});

describe("element lookups under a call's deadline", () => {
  const SEL = { name: "composer.editor", candidates: [{ css: "#nothing" }] };
  /** A page where no selector ever matches; records the timeouts it was given. */
  function emptyPage() {
    const timeouts: number[] = [];
    const page = {
      locator: () => ({ count: async () => 0 }),
      waitForSelector: async (_css: string, opts: { timeout: number }) => {
        timeouts.push(opts.timeout);
        throw new Error(`Timeout ${opts.timeout}ms exceeded.`);
      },
    } as unknown as Page;
    return { page, timeouts };
  }

  it("reports a missing element as SELECTOR_BROKEN while there is budget left", async () => {
    const { page } = emptyPage();
    await expect(runWithDeadline(new Deadline(60_000), () => find(page, SEL, { timeout: 1 }))).rejects.toMatchObject({ code: "SELECTOR_BROKEN" });
    await expect(find(page, SEL, { timeout: 1 })).rejects.toMatchObject({ code: "SELECTOR_BROKEN" });
  });

  it("reports TIMEOUT, not a broken selector, once the budget is gone", async () => {
    const { page } = emptyPage();
    let now = 0;
    const deadline = new Deadline(1000, () => now);
    now = 1000;
    await expect(runWithDeadline(deadline, () => find(page, SEL, { timeout: 30_000 }))).rejects.toMatchObject({
      code: "TIMEOUT",
      details: { stage: 'looking for "composer.editor"' },
    });
    expect(await runWithDeadline(deadline, () => findOptional(page, SEL, { timeout: 30_000 }))).toBeNull();
  });

  it("caps waits to the remaining budget and turns a cut-short wait into TIMEOUT", async () => {
    const { page, timeouts } = emptyPage();
    let now = 0;
    const deadline = new Deadline(10_000, () => now);
    now = 7000;
    await expect(runWithDeadline(deadline, async () => waitForAny(page, ["main"], 15_000))).resolves.toBe(false);
    expect(timeouts[0]).toBe(3000);
    now = 10_000;
    await expect(runWithDeadline(deadline, async () => waitForAny(page, ["main"], 15_000))).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "page_wait" } });
    expect(timeouts[1]).toBe(1);
    // outside a browser call, nothing changes
    await expect(waitForAny(page, ["main"], 15_000)).resolves.toBe(false);
    expect(timeouts[2]).toBe(15_000);
    expect(currentDeadline()).toBeUndefined();
  });
});

describe("shouldTypeKeyByKey", () => {
  it("types key by key only when the estimate leaves the reserve free", () => {
    expect(shouldTypeKeyByKey(100, 10_000, 55_000)).toBe(true);
    expect(shouldTypeKeyByKey(100, 10_000, 10_000 + TYPING_RESERVE_MS)).toBe(true);
    expect(shouldTypeKeyByKey(100, 10_000, 10_000 + TYPING_RESERVE_MS - 1)).toBe(false);
    expect(shouldTypeKeyByKey(PER_CHAR_TYPING_MAX + 1, 0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(shouldTypeKeyByKey(PER_CHAR_TYPING_MAX, 60_000, Number.POSITIVE_INFINITY)).toBe(true);
  });

  it("estimates more than the sum of the delays", () => {
    expect(estimateKeyTypingMs([100, 100])).toBeGreaterThan(200);
    expect(estimateKeyTypingMs([])).toBe(0);
  });
});

describe("Pacer with a deadline", () => {
  it("types a short comment key by key when there is time", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(1), t.now).withDeadline(new Deadline(55_000, t.now));
    const { page, calls } = fakeKeyboardPage();
    await pacer.typeText(page, "Great post!");
    expect(calls).toHaveLength("Great post!".length);
    expect(calls.every((c) => c.startsWith("type:"))).toBe(true);
  });

  it("inserts text paragraph by paragraph when key by key wouldn't fit the budget", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(1), t.now).withDeadline(new Deadline(55_000, t.now));
    const { page, calls } = fakeKeyboardPage();
    // ~500 characters takes well over 40 s key by key.
    const text = `${"Thanks for sharing this, it is genuinely useful. ".repeat(5)}\n${"Here is what I learned from it. ".repeat(6)}`;
    expect([...text].length).toBeLessThanOrEqual(PER_CHAR_TYPING_MAX);
    const started = t.now();
    await pacer.typeText(page, text);
    expect(calls.filter((c) => c.startsWith("insert:"))).toHaveLength(2);
    expect(calls).toContain("press:Enter");
    expect(t.now() - started).toBeLessThan(2000);
  });

  it("spreads paragraph pauses so long text finishes inside a tight budget", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(2), t.now).withDeadline(new Deadline(20_000, t.now));
    const { page, calls } = fakeKeyboardPage();
    const text = Array.from({ length: 80 }, (_, i) => `Line ${i}`).join("\n");
    await pacer.typeText(page, text);
    expect(calls.filter((c) => c.startsWith("insert:"))).toHaveLength(80);
    expect(Math.max(...t.sleeps)).toBeLessThanOrEqual(62);
  });

  it("refuses to start typing once the budget is gone", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(1), t.now).withDeadline(new Deadline(1000, t.now));
    t.advance(1000);
    const { page, calls } = fakeKeyboardPage();
    await expect(pacer.typeText(page, "hi")).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "typing" } });
    expect(calls).toHaveLength(0);
  });

  it("never throws from a beat (beats follow send clicks), it only stops waiting", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(1), t.now).withDeadline(new Deadline(1000, t.now));
    t.advance(5000);
    await expect(pacer.beat(1500, 3000)).resolves.toBeUndefined();
    expect(t.sleeps.at(-1)).toBe(0);
  });

  it("throws instead of shortening the gap between actions", async () => {
    const t = virtualTime();
    const base = new Pacer(t.sleep, seededRng(3), t.now);
    await base.betweenActions(); // first action: no wait
    const pacer = base.withDeadline(new Deadline(1000, t.now)); // less than the 1.5 s minimum gap
    await expect(pacer.betweenActions()).rejects.toMatchObject({ code: "TIMEOUT", details: { stage: "pacing" } });
    expect(t.sleeps).toHaveLength(0);
  });

  it("shares the action rhythm with the pacer it came from", async () => {
    const t = virtualTime();
    const base = new Pacer(t.sleep, seededRng(3), t.now);
    expect(await base.withDeadline(new Deadline(55_000, t.now)).betweenActions()).toBe(0);
    // the second call, through another view, is spaced from the first
    expect(await base.withDeadline(new Deadline(55_000, t.now)).betweenActions()).toBeGreaterThan(0);
  });

  it("checks the budget before scrolling and after a navigation", async () => {
    const t = virtualTime();
    const pacer = new Pacer(t.sleep, seededRng(1), t.now).withDeadline(new Deadline(1000, t.now));
    t.advance(1000);
    const { page } = fakeKeyboardPage();
    await expect(pacer.scroll(page, 2)).rejects.toMatchObject({ details: { stage: "scroll" } });
    await expect(pacer.afterNavigation()).rejects.toMatchObject({ details: { stage: "navigation" } });
  });
});
