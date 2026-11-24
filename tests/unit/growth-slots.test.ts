import { describe, expect, it } from "vitest";
import { DEFAULT_DAYS, type SlotPlanInput, planSlots, spreadDays, weekKey, weekdayOfKey } from "../../src/growth/workspace/slots.js";

// Tuesday 24 November 2026, 10:00 local time.
const NOW = new Date(2026, 10, 24, 10, 0);

function plan(over: Partial<SlotPlanInput> = {}) {
  return planSlots({ from: "2026-11-23", to: "2026-12-06", posts_per_week: 3, days: ["mon", "wed", "fri"], time_windows: [{ start: "08:00", end: "10:00" }], existing: [], now: NOW, ...over });
}

describe("day helpers", () => {
  it("knows weekdays and week starts", () => {
    expect(weekdayOfKey("2026-11-24")).toBe("tue");
    expect(weekdayOfKey("2026-11-29")).toBe("sun");
    expect(weekKey("2026-11-29")).toBe("2026-11-23");
    expect(weekKey("2026-11-30")).toBe("2026-11-30");
  });

  it("spreads posts evenly across the allowed days", () => {
    const weekdays = ["mon", "tue", "wed", "thu", "fri"] as const;
    expect(spreadDays([...weekdays], 3)).toEqual(["mon", "wed", "fri"]);
    expect(spreadDays([...weekdays], 2)).toEqual(["tue", "thu"]);
    expect(spreadDays([...weekdays], 1)).toEqual(["wed"]);
    expect(spreadDays(["fri", "mon"], 5)).toEqual(["mon", "fri"]);
    expect(spreadDays([...weekdays], 0)).toEqual([]);
  });
});

describe("planSlots", () => {
  it("plans the cadence days at the window start, skipping the past", () => {
    const p = plan();
    expect(p.slots.map((s) => `${s.weekday} ${s.date} ${s.time}`)).toEqual([
      "wed 2026-11-25 08:00",
      "fri 2026-11-27 08:00",
      "mon 2026-11-30 08:00",
      "wed 2026-12-02 08:00",
      "fri 2026-12-04 08:00",
    ]);
    expect(p.skipped).toEqual([{ date: "2026-11-23", reason: "in the past" }]);
    expect(p.notes).toEqual([]);
  });

  it("uses a later time today when the window is still open, and skips it when it has closed", () => {
    const open = plan({ from: "2026-11-24", to: "2026-11-24", days: ["tue"], posts_per_week: 1, time_windows: [{ start: "08:00", end: "12:00" }] });
    expect(open.slots).toEqual([{ date: "2026-11-24", time: "10:30", weekday: "tue", window: { start: "08:00", end: "12:00" } }]);
    const closed = plan({ from: "2026-11-24", to: "2026-11-24", days: ["tue"], posts_per_week: 1 });
    expect(closed.slots).toEqual([]);
    expect(closed.skipped[0]!.reason).toMatch(/too late today/);
  });

  it("respects the days the user can post", () => {
    const p = plan({ allowed_days: ["tue", "wed", "thu"] });
    expect(p.days_used).toEqual(["wed"]);
    expect(p.notes.join()).toMatch(/Left out mon, fri/);
    expect(p.notes.join()).toMatch(/only 1 posting day/);
    const none = plan({ days: ["sat"], allowed_days: ["mon", "tue"], posts_per_week: 2 });
    expect(none.days_used).toEqual(["mon", "tue"]);
    expect(none.notes.join()).toMatch(/planned on your days instead/);
  });

  it("falls back to sensible defaults and says so", () => {
    const p = plan({ days: undefined, time_windows: undefined });
    expect(p.days_used).toEqual(DEFAULT_DAYS);
    expect(p.windows_used).toEqual([{ start: "08:00", end: "10:00" }]);
    expect(p.notes.join()).toMatch(/No posting days set/);
    expect(p.notes.join()).toMatch(/No time window set/);
  });

  it("caps posts per week by the profile and counts existing slots", () => {
    const capped = plan({ max_posts_per_week: 2 });
    expect(capped.days_used).toEqual(["mon", "fri"]);
    expect(capped.notes.join()).toMatch(/Capped at 2/);

    const p = plan({
      existing: [
        { id: "slot-1", date: "2026-11-25", status: "planned" },
        { id: "slot-2", date: "2026-11-26", status: "drafted" },
        { id: "slot-3", date: "2026-11-24", status: "published" },
        { id: "slot-4", date: "2026-11-30", status: "skipped" },
      ],
    });
    expect(p.skipped).toEqual(
      expect.arrayContaining([
        { date: "2026-11-25", reason: "already has a slot (slot-1)" },
        { date: "2026-11-27", reason: "week of 2026-11-23 already has 3 post(s) planned" },
      ]),
    );
    // A skipped slot frees its day.
    expect(p.slots.map((s) => s.date)).toEqual(["2026-11-30", "2026-12-02", "2026-12-04"]);
  });

  it("never plans more than one post a day", () => {
    const p = plan({ days: ["wed"], posts_per_week: 3 });
    expect(p.slots.map((s) => s.date)).toEqual(["2026-11-25", "2026-12-02"]);
  });

  it("rotates between time windows and keeps windows inside the user's hours", () => {
    const p = plan({ time_windows: [{ start: "08:00", end: "09:00" }, { start: "12:05", end: "13:00" }] });
    expect(p.slots.map((s) => s.time)).toEqual(["08:00", "12:15", "08:00", "12:15", "08:00"]);
    const outside = plan({ time_windows: [{ start: "18:00", end: "19:00" }], allowed_windows: [{ start: "07:00", end: "09:00" }] });
    expect(outside.windows_used).toEqual([{ start: "07:00", end: "09:00" }]);
    expect(outside.notes.join()).toMatch(/used your windows instead/);
  });

  it("stops at LinkedIn's 90-day scheduler window", () => {
    const p = plan({ from: "2027-02-20", to: "2027-02-26", days: ["mon", "tue", "wed", "thu", "fri"], posts_per_week: 5 });
    expect(p.slots.map((s) => s.date)).toEqual(["2027-02-22"]);
    expect(p.skipped.map((s) => s.reason)).toEqual(expect.arrayContaining([expect.stringMatching(/more than 90 days ahead/)]));
  });
});
