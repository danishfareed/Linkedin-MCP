import { describe, expect, it } from "vitest";
import { ACTION_DELAY, NAV_PAUSE, Pacer, keystrokeDelays, logNormalDelay } from "../../src/browser/human.js";
import { seededRng } from "./helpers.js";

describe("logNormalDelay", () => {
  it("stays within 1.5–20 s and has a median near 4 s", () => {
    const rng = seededRng(7);
    const samples = Array.from({ length: 5000 }, () => logNormalDelay(rng));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(ACTION_DELAY.minMs);
    expect(Math.max(...samples)).toBeLessThanOrEqual(ACTION_DELAY.maxMs);
    const sorted = [...samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    expect(median).toBeGreaterThan(3400);
    expect(median).toBeLessThan(4600);
  });
});

describe("keystrokeDelays", () => {
  it("returns one delay per character, all in a human range", () => {
    const text = "Thanks for sharing this, really useful. ".repeat(4);
    const delays = keystrokeDelays(text, seededRng(1));
    expect(delays).toHaveLength([...text].length);
    expect(Math.min(...delays)).toBeGreaterThanOrEqual(35);
    expect(Math.max(...delays)).toBeLessThan(1300);
    // includes at least one thinking pause
    expect(delays.some((d) => d >= 300)).toBe(true);
  });

  it("counts emoji as single characters", () => {
    expect(keystrokeDelays("hi 👋", seededRng(1))).toHaveLength(4);
  });
});

describe("Pacer", () => {
  it("does not delay the first action, then spaces later ones", async () => {
    let now = 1_000_000;
    const waits: number[] = [];
    const pacer = new Pacer(
      async (ms) => {
        waits.push(ms);
        now += ms;
      },
      seededRng(3),
      () => now,
    );
    expect(await pacer.betweenActions()).toBe(0);
    const wait = await pacer.betweenActions();
    expect(wait).toBeGreaterThanOrEqual(ACTION_DELAY.minMs);
    // if enough time has already passed, no extra wait
    now += 60_000;
    expect(await pacer.betweenActions()).toBe(0);
  });

  it("pauses 1–4 s after navigation", async () => {
    const pacer = new Pacer(async () => undefined, seededRng(9));
    for (let i = 0; i < 100; i++) {
      const ms = await pacer.afterNavigation();
      expect(ms).toBeGreaterThanOrEqual(NAV_PAUSE.minMs);
      expect(ms).toBeLessThanOrEqual(NAV_PAUSE.maxMs);
    }
  });
});
