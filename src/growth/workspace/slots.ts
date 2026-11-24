import { addLocalDays, atLocalTime, dayKeyToDate, localDayKey, minutesOfDay } from "../../util/time.js";
import { type TimeWindow, WEEKDAYS, type Weekday } from "./schemas.js";

/**
 * Pure calendar-slot planning: which dates and times to post on, from the
 * strategy cadence and the user's posting constraints. No I/O.
 */

/**
 * Used only when neither the strategy nor the profile says anything.
 * Basis: mid-week weekday mornings are the most commonly reported good times
 * in third-party studies of LinkedIn posting; a heuristic starting point that
 * the user's own analytics should replace (see growth_report).
 */
export const DEFAULT_DAYS: Weekday[] = ["tue", "wed", "thu"];
export const DEFAULT_WINDOW: TimeWindow = { start: "08:00", end: "10:00" };

/** LinkedIn's scheduler works in 15-minute steps, 30 minutes to 90 days ahead (see schedule_post). */
export const SCHEDULER = { stepMinutes: 15, minLeadMinutes: 30, maxDaysAhead: 90 } as const;

export function weekdayOf(date: Date): Weekday {
  return WEEKDAYS[(date.getDay() + 6) % 7]!;
}

export function weekdayOfKey(dayKey: string): Weekday {
  return weekdayOf(dayKeyToDate(dayKey));
}

/** Monday of the week containing this day, as a day key. */
export function weekKey(dayKey: string): string {
  const d = dayKeyToDate(dayKey);
  return localDayKey(addLocalDays(d, -((d.getDay() + 6) % 7)));
}

function order(days: Iterable<Weekday>): Weekday[] {
  const set = new Set(days);
  return WEEKDAYS.filter((d) => set.has(d));
}

/**
 * Picks k of the allowed days, spread as evenly as possible across the week:
 * 3 of Mon-Fri gives Mon, Wed, Fri; 2 gives Tue, Thu.
 */
export function spreadDays(allowed: Weekday[], k: number): Weekday[] {
  const days = order(allowed);
  if (k >= days.length) return days;
  if (k <= 0) return [];
  const step = days.length / k;
  const picked = new Set<Weekday>();
  for (let i = 0; i < k; i++) picked.add(days[Math.min(days.length - 1, Math.floor(i * step + step / 2))]!);
  return order(picked);
}

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
  return a.start < b.end && b.start < a.end;
}

function toHhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function roundUp(minutes: number, step: number): number {
  return Math.ceil(minutes / step) * step;
}

export interface SlotPlanInput {
  from: string;
  to: string;
  posts_per_week: number;
  /** Cadence days from the strategy. */
  days?: Weekday[];
  /** Cadence windows from the strategy. */
  time_windows?: TimeWindow[];
  /** Days the user said they can post (profile). */
  allowed_days?: Weekday[];
  /** Windows the user said they can post in (profile). */
  allowed_windows?: TimeWindow[];
  max_posts_per_week?: number;
  /** Slots already in the calendar. */
  existing: { id?: string; date: string; status: string }[];
  now: Date;
}

export interface PlannedSlot {
  date: string;
  time: string;
  weekday: Weekday;
  window: TimeWindow;
}

export interface SlotPlan {
  slots: PlannedSlot[];
  skipped: { date: string; reason: string }[];
  notes: string[];
  days_used: Weekday[];
  windows_used: TimeWindow[];
}

/** Which days to post on, honouring the user's own days over the strategy's. */
function chooseDays(input: SlotPlanInput, perWeek: number, notes: string[]): Weekday[] {
  const cadence = input.days?.length ? order(input.days) : null;
  const allowed = input.allowed_days?.length ? order(input.allowed_days) : null;
  let pool: Weekday[];
  if (cadence && allowed) {
    pool = cadence.filter((d) => allowed.includes(d));
    if (!pool.length) {
      notes.push(`None of the strategy days (${cadence.join(", ")}) are days you can post (${allowed.join(", ")}); planned on your days instead.`);
      pool = allowed;
    } else if (pool.length < cadence.length) {
      notes.push(`Left out ${cadence.filter((d) => !allowed.includes(d)).join(", ")}: not one of the days you can post.`);
    }
  } else {
    pool = cadence ?? allowed ?? DEFAULT_DAYS;
    if (!cadence && !allowed) notes.push(`No posting days set; used ${DEFAULT_DAYS.join(", ")} as a starting point.`);
  }
  if (pool.length < perWeek) notes.push(`${perWeek} posts a week asked for, but only ${pool.length} posting day(s) available; the calendar plans at most one post a day.`);
  return spreadDays(pool, perWeek);
}

function chooseWindows(input: SlotPlanInput, notes: string[]): TimeWindow[] {
  const cadence = input.time_windows ?? [];
  const allowed = input.allowed_windows ?? [];
  if (cadence.length && allowed.length) {
    const fits = cadence.filter((w) => allowed.some((a) => overlaps(w, a)));
    if (fits.length) {
      if (fits.length < cadence.length) notes.push("Some strategy time windows fall outside the times you said you can post; they were left out.");
      return fits;
    }
    notes.push("The strategy's time windows fall outside the times you said you can post; used your windows instead.");
    return allowed;
  }
  if (cadence.length) return cadence;
  if (allowed.length) return allowed;
  notes.push(`No time window set; used ${DEFAULT_WINDOW.start}–${DEFAULT_WINDOW.end}.`);
  return [DEFAULT_WINDOW];
}

/** The earliest schedulable time in this window on this day, or null. */
function timeInWindow(dayKey: string, w: TimeWindow, now: Date): string | null {
  const start = roundUp(minutesOfDay(w.start), SCHEDULER.stepMinutes);
  const end = minutesOfDay(w.end);
  const earliest = now.getTime() + SCHEDULER.minLeadMinutes * 60_000;
  for (let m = start; m < end && m < 24 * 60; m += SCHEDULER.stepMinutes) {
    if (atLocalTime(dayKeyToDate(dayKey), toHhmm(m)).getTime() >= earliest) return toHhmm(m);
  }
  return null;
}

/**
 * Plans posting slots between `from` and `to` (inclusive day keys). At most
 * one slot per day and `posts_per_week` per Monday-to-Sunday week, counting
 * slots already in the calendar. Days in the past, too soon to schedule, or
 * beyond LinkedIn's 90-day scheduler window are skipped with a reason.
 */
export function planSlots(input: SlotPlanInput): SlotPlan {
  const notes: string[] = [];
  const skipped: SlotPlan["skipped"] = [];
  const perWeek = Math.max(0, Math.min(input.posts_per_week, input.max_posts_per_week ?? Number.POSITIVE_INFINITY));
  if (input.max_posts_per_week !== undefined && input.max_posts_per_week < input.posts_per_week) {
    notes.push(`Capped at ${input.max_posts_per_week} posts a week, the most your profile allows.`);
  }
  const days = chooseDays(input, perWeek, notes);
  const windows = chooseWindows(input, notes);

  const active = input.existing.filter((s) => s.status !== "skipped");
  const byDate = new Map(active.map((s) => [s.date, s]));
  const perWeekCount = new Map<string, number>();
  for (const s of active) perWeekCount.set(weekKey(s.date), (perWeekCount.get(weekKey(s.date)) ?? 0) + 1);

  const today = localDayKey(input.now);
  const lastSchedulable = localDayKey(addLocalDays(input.now, SCHEDULER.maxDaysAhead));
  const slots: PlannedSlot[] = [];
  let rotation = 0;

  for (let d = dayKeyToDate(input.from); localDayKey(d) <= input.to; d = addLocalDays(d, 1)) {
    const key = localDayKey(d);
    const wd = weekdayOf(d);
    if (!days.includes(wd)) continue;
    const existing = byDate.get(key);
    if (existing) {
      skipped.push({ date: key, reason: `already has a slot${existing.id ? ` (${existing.id})` : ""}` });
      continue;
    }
    const wk = weekKey(key);
    if ((perWeekCount.get(wk) ?? 0) >= perWeek) {
      skipped.push({ date: key, reason: `week of ${wk} already has ${perWeek} post(s) planned` });
      continue;
    }
    if (key < today) {
      skipped.push({ date: key, reason: "in the past" });
      continue;
    }
    if (key > lastSchedulable) {
      skipped.push({ date: key, reason: `more than ${SCHEDULER.maxDaysAhead} days ahead, beyond LinkedIn's scheduler` });
      continue;
    }
    const window = windows[rotation % windows.length]!;
    const time = timeInWindow(key, window, input.now);
    if (!time) {
      skipped.push({ date: key, reason: `too late today to schedule inside ${window.start}–${window.end}` });
      continue;
    }
    if (atLocalTime(d, time).getTime() > input.now.getTime() + SCHEDULER.maxDaysAhead * 86_400_000) {
      skipped.push({ date: key, reason: `more than ${SCHEDULER.maxDaysAhead} days ahead, beyond LinkedIn's scheduler` });
      continue;
    }
    slots.push({ date: key, time, weekday: wd, window });
    perWeekCount.set(wk, (perWeekCount.get(wk) ?? 0) + 1);
    rotation++;
  }
  return { slots, skipped, notes, days_used: days, windows_used: windows };
}
