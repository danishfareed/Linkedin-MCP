import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LimitOverrides } from "../../src/config.js";
import type { LinkedInMcpError } from "../../src/errors.js";
import {
  LIMIT_TABLE,
  Limits,
  assertWorkingHours,
  effectiveDailyCap,
  validateLimitChanges,
} from "../../src/safety/limits.js";
import { fakeClock, tempDir } from "./helpers.js";

async function codeOf(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (err) {
    return (err as LinkedInMcpError).code;
  }
  return undefined;
}

function setup(start = new Date(2026, 10, 24, 10, 0), overrides: LimitOverrides = {}) {
  const t = fakeClock(start);
  const file = join(tempDir(), "limits.json");
  const limits = new Limits(file, () => overrides, t.clock);
  return { t, limits, file };
}

describe("effectiveDailyCap", () => {
  it("uses defaults, honours lower overrides and clamps to the ceiling", () => {
    expect(effectiveDailyCap("post", {}, false)).toBe(2);
    expect(effectiveDailyCap("post", { post: 1 }, false)).toBe(1);
    expect(effectiveDailyCap("post", { post: 99 }, false)).toBe(LIMIT_TABLE.post.ceiling);
    expect(effectiveDailyCap("comment", { comment: 0 }, false)).toBe(0);
  });

  it("halves caps during warm-up, never below 1 unless disabled", () => {
    expect(effectiveDailyCap("post", {}, true)).toBe(1);
    expect(effectiveDailyCap("connection", {}, true)).toBe(5);
    expect(effectiveDailyCap("page_load", {}, true)).toBe(150);
    expect(effectiveDailyCap("post", { post: 1 }, true)).toBe(1);
    expect(effectiveDailyCap("post", { post: 0 }, true)).toBe(0);
  });
});

describe("Limits", () => {
  it("treats a never-signed-in install as warm-up", async () => {
    const { limits } = setup();
    const status = await limits.status();
    expect(status.warmup.active).toBe(true);
    expect(status.actions.find((a) => a.action === "post")?.daily_cap).toBe(1);
  });

  it("ends warm-up 14 days after the first sign-in", async () => {
    const { t, limits } = setup();
    await limits.startWarmupIfNeeded();
    expect((await limits.status()).warmup.active).toBe(true);
    t.advance(14 * 86_400_000 + 1000);
    expect((await limits.status()).warmup.active).toBe(false);
    // idempotent: does not restart the clock
    await limits.startWarmupIfNeeded();
    expect((await limits.status()).warmup.active).toBe(false);
  });

  it("consumes until the daily cap, then refuses with the reset time", async () => {
    const { t, limits } = setup();
    await limits.startWarmupIfNeeded();
    t.advance(15 * 86_400_000); // past warm-up
    await limits.consume("post");
    await limits.consume("post");
    try {
      await limits.consume("post");
      expect.unreachable();
    } catch (err) {
      const e = err as LinkedInMcpError;
      expect(e.code).toBe("LIMIT_REACHED");
      expect(e.details?.window).toBe("day");
      const resets = new Date(e.details?.resets_at as string);
      expect(resets.getHours()).toBe(0);
      expect(resets.getTime()).toBeGreaterThan(t.clock().getTime());
    }
    // refused attempts are not counted
    const usage = (await limits.status()).actions.find((a) => a.action === "post")!;
    expect(usage.used_today).toBe(2);
  });

  it("resets the daily count at local midnight", async () => {
    const { t, limits } = setup();
    await limits.startWarmupIfNeeded();
    t.advance(15 * 86_400_000);
    await limits.consume("post", 2);
    expect(await codeOf(limits.assertAvailable("post"))).toBe("LIMIT_REACHED");
    t.advance(24 * 3_600_000);
    expect(await codeOf(limits.assertAvailable("post"))).toBeUndefined();
  });

  it("enforces the weekly ceiling over a rolling 7 days, and rolls over", async () => {
    const { t, limits } = setup(new Date(2026, 10, 1, 10, 0), { connection: 20 });
    await limits.startWarmupIfNeeded();
    t.advance(15 * 86_400_000);
    // 4 days x 20 = 80 = weekly ceiling
    for (let d = 0; d < 4; d++) {
      await limits.consume("connection", 20);
      t.advance(86_400_000);
    }
    try {
      await limits.consume("connection");
      expect.unreachable();
    } catch (err) {
      expect((err as LinkedInMcpError).details?.window).toBe("week");
    }
    // three more days later the first day has dropped out of the window
    t.advance(3 * 86_400_000);
    expect(await codeOf(limits.assertAvailable("connection", 20))).toBeUndefined();
  });

  it("never lets an override exceed the hard ceiling", async () => {
    const { t, limits } = setup(new Date(2026, 10, 1, 10), { post: 50 });
    await limits.startWarmupIfNeeded();
    t.advance(15 * 86_400_000);
    await limits.consume("post", 3);
    expect(await codeOf(limits.consume("post"))).toBe("LIMIT_REACHED");
  });

  it("serialises concurrent consumers without losing counts", async () => {
    const { limits } = setup(new Date(2026, 10, 24, 10), { page_load: 500 });
    await Promise.all(Array.from({ length: 25 }, () => limits.consume("page_load")));
    const usage = (await limits.status()).actions.find((a) => a.action === "page_load")!;
    expect(usage.used_today).toBe(25);
  });
});

describe("validateLimitChanges", () => {
  it("accepts values up to the ceiling", () => {
    expect(() => validateLimitChanges({ post: 3, comment: 0 })).not.toThrow();
  });
  it("rejects values above the ceiling", () => {
    expect(() => validateLimitChanges({ reaction: 101 })).toThrow(/hard ceiling of 100/);
  });
});

describe("assertWorkingHours", () => {
  const hours = { start: "08:00", end: "21:00" };
  const at = (h: number, m = 0) => new Date(2026, 10, 24, h, m);

  it("allows inside the window and refuses outside it", () => {
    expect(() => assertWorkingHours(hours, at(8, 0))).not.toThrow();
    expect(() => assertWorkingHours(hours, at(20, 59))).not.toThrow();
    expect(() => assertWorkingHours(hours, at(21, 0))).toThrow(/between 08:00 and 21:00/);
    expect(() => assertWorkingHours(hours, at(7, 59))).toThrow();
  });

  it("points to the next window start", () => {
    try {
      assertWorkingHours(hours, at(22, 30));
      expect.unreachable();
    } catch (err) {
      const next = new Date((err as LinkedInMcpError).details?.next_window_starts_at as string);
      expect(next.getDate()).toBe(25);
      expect(next.getHours()).toBe(8);
    }
    try {
      assertWorkingHours(hours, at(6, 0));
      expect.unreachable();
    } catch (err) {
      const next = new Date((err as LinkedInMcpError).details?.next_window_starts_at as string);
      expect(next.getDate()).toBe(24);
    }
  });

  it("supports overnight windows and 'off'", () => {
    const night = { start: "22:00", end: "06:00" };
    expect(() => assertWorkingHours(night, at(23))).not.toThrow();
    expect(() => assertWorkingHours(night, at(5))).not.toThrow();
    expect(() => assertWorkingHours(night, at(12))).toThrow();
    expect(() => assertWorkingHours("off", at(3))).not.toThrow();
  });
});
