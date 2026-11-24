import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LinkedInMcpError } from "../../src/errors.js";
import { Limits } from "../../src/safety/limits.js";
import { fakeClock, tempDir } from "./helpers.js";

/** Limits past the warm-up, on Monday 2026-11-23 at 10:00 local time. */
async function setup() {
  const t = fakeClock(new Date(2026, 9, 1, 10, 0));
  const limits = new Limits(join(tempDir(), "limits.json"), () => ({}), t.clock);
  await limits.startWarmupIfNeeded();
  t.set(new Date(2026, 10, 23, 10, 0));
  return { limits, t };
}

const day = (d: number) => new Date(2026, 10, d, 9, 0);

describe("scheduled posts count on their publish day", () => {
  it("lets a week be planned in one session at the daily pace", async () => {
    const { limits } = await setup();
    // Two posts a day is the default cap. Five posts on five different days is fine today.
    for (const d of [24, 25, 26, 27, 28]) await limits.consume("post", 1, { on: day(d) });
    const status = await limits.status();
    expect(status.actions.find((a) => a.action === "post")!.used_today).toBe(0);
  });

  it("refuses a third post on the same publish day", async () => {
    const { limits } = await setup();
    await limits.consume("post", 1, { on: day(25) });
    await limits.consume("post", 1, { on: day(25) });
    const err = (await limits.consume("post", 1, { on: day(25) }).catch((e: unknown) => e)) as LinkedInMcpError;
    expect(err.code).toBe("LIMIT_REACHED");
    expect(err.message).toMatch(/used on /);
    expect(err.details).toMatchObject({ window: "day", day: "2026-11-25" });
    // Today is unaffected.
    await expect(limits.assertAvailable("post")).resolves.toBeUndefined();
  });

  it("holds every 7-day window to the weekly ceiling, including future days", async () => {
    const t = fakeClock(new Date(2026, 9, 1, 10, 0));
    const limits = new Limits(join(tempDir(), "limits.json"), () => ({ post: 3 }), t.clock);
    await limits.startWarmupIfNeeded();
    t.set(new Date(2026, 10, 20, 10, 0));
    // 3 a day on the 24th to the 28th fills the weekly ceiling of 15 for the window 22nd to 28th.
    for (let d = 24; d <= 28; d++) for (let i = 0; i < 3; i++) await limits.consume("post", 1, { on: day(d) });
    // The 22nd has no posts (daily room left), but it sits inside that full window.
    const err = (await limits.assertAvailable("post", 1, { on: day(22) }).catch((e: unknown) => e)) as LinkedInMcpError;
    expect(err.code).toBe("LIMIT_REACHED");
    expect(err.details).toMatchObject({ window: "week", used: 15, cap: 15 });
    // The 21st is outside every window that holds 15 posts.
    await expect(limits.assertAvailable("post", 1, { on: day(21) })).resolves.toBeUndefined();
  });

});
