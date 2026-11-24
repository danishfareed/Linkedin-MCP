import type { Config, LimitOverrides } from "../config.js";
import { LinkedInMcpError, invalidInput } from "../errors.js";
import { readJson, updateJson } from "../state/store.js";
import {
  type Clock,
  addLocalDays,
  atLocalTime,
  dayKeyToDate,
  formatLocal,
  localDayKey,
  minutesOfDay,
  nextLocalMidnight,
  systemClock,
} from "../util/time.js";

export const LIMIT_ACTIONS = [
  "post",
  "comment",
  "reaction",
  "connection",
  "message",
  "profile_view",
  "search",
  "page_load",
] as const;

export type LimitAction = (typeof LIMIT_ACTIONS)[number];

export interface LimitSpec {
  label: string;
  default: number;
  ceiling: number;
  weekly: number | null;
}

/** Defaults and hard ceilings from the design (section 5.3). Never exceed `ceiling`. */
export const LIMIT_TABLE: Record<LimitAction, LimitSpec> = {
  post: { label: "Posts (published or scheduled)", default: 2, ceiling: 3, weekly: 15 },
  comment: { label: "Comments and replies", default: 15, ceiling: 30, weekly: 150 },
  reaction: { label: "Reactions", default: 40, ceiling: 100, weekly: 500 },
  connection: { label: "Connection requests", default: 10, ceiling: 20, weekly: 80 },
  message: { label: "Messages", default: 15, ceiling: 30, weekly: 150 },
  profile_view: { label: "Profile views (research)", default: 40, ceiling: 80, weekly: 400 },
  search: { label: "Searches", default: 15, ceiling: 30, weekly: 150 },
  page_load: { label: "Page loads overall", default: 300, ceiling: 500, weekly: null },
};

export const WARMUP_DAYS = 14;
const KEEP_DAYS = 14;

export interface LimitsState {
  version: 1;
  warmupStartedAt: string | null;
  days: Record<string, Partial<Record<LimitAction, number>>>;
}

const EMPTY_STATE: LimitsState = { version: 1, warmupStartedAt: null, days: {} };

export interface ActionUsage {
  action: LimitAction;
  label: string;
  used_today: number;
  daily_cap: number;
  configured_daily: number;
  hard_ceiling: number;
  used_this_week: number;
  weekly_cap: number | null;
  daily_resets_at: string;
  weekly_resets_at: string | null;
}

export interface LimitsStatus {
  now: string;
  warmup: { active: boolean; started_at: string | null; ends_at: string | null; note: string };
  week_definition: string;
  actions: ActionUsage[];
}

function pruneDays(state: LimitsState, now: Date): LimitsState {
  const cutoff = localDayKey(addLocalDays(now, -KEEP_DAYS));
  const days: LimitsState["days"] = {};
  for (const [key, counts] of Object.entries(state.days)) {
    if (key >= cutoff) days[key] = counts;
  }
  return { ...state, days };
}

function weekKeys(now: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => localDayKey(addLocalDays(now, -i)));
}

export function isWarmup(state: LimitsState, now: Date): boolean {
  if (!state.warmupStartedAt) return true; // never logged in successfully yet: be conservative
  const started = new Date(state.warmupStartedAt);
  return now.getTime() < started.getTime() + WARMUP_DAYS * 86_400_000;
}

export function configuredDaily(action: LimitAction, overrides: LimitOverrides): number {
  const spec = LIMIT_TABLE[action];
  const wanted = overrides[action] ?? spec.default;
  return Math.max(0, Math.min(wanted, spec.ceiling));
}

export function effectiveDailyCap(action: LimitAction, overrides: LimitOverrides, warmup: boolean): number {
  const base = configuredDaily(action, overrides);
  if (!warmup || base === 0) return base;
  return Math.max(1, Math.floor(base / 2));
}

function usedOn(state: LimitsState, key: string, action: LimitAction): number {
  return state.days[key]?.[action] ?? 0;
}

function usedThisWeek(state: LimitsState, now: Date, action: LimitAction): number {
  return weekKeys(now).reduce((sum, key) => sum + usedOn(state, key, action), 0);
}

/** When the oldest counted day in the rolling 7-day window drops out. */
function weeklyResetsAt(state: LimitsState, now: Date, action: LimitAction): Date {
  const keys = weekKeys(now).reverse(); // oldest first
  const oldest = keys.find((k) => usedOn(state, k, action) > 0) ?? localDayKey(now);
  return addLocalDays(dayKeyToDate(oldest), 7);
}

export class Limits {
  constructor(
    private readonly file: string,
    private readonly overrides: () => LimitOverrides,
    private readonly clock: Clock = systemClock,
  ) {}

  async read(): Promise<LimitsState> {
    return readJson<LimitsState>(this.file, EMPTY_STATE);
  }

  async status(): Promise<LimitsStatus> {
    const now = this.clock();
    const state = await this.read();
    const warmup = isWarmup(state, now);
    const overrides = this.overrides();
    const today = localDayKey(now);
    const endsAt = state.warmupStartedAt
      ? new Date(new Date(state.warmupStartedAt).getTime() + WARMUP_DAYS * 86_400_000)
      : null;
    return {
      now: now.toISOString(),
      warmup: {
        active: warmup,
        started_at: state.warmupStartedAt,
        ends_at: endsAt ? endsAt.toISOString() : null,
        note: warmup
          ? `Daily caps are halved for the first ${WARMUP_DAYS} days after your first sign-in.`
          : "Warm-up finished. Normal daily caps apply.",
      },
      week_definition: "Rolling 7 days, including today.",
      actions: LIMIT_ACTIONS.map((action) => {
        const spec = LIMIT_TABLE[action];
        return {
          action,
          label: spec.label,
          used_today: usedOn(state, today, action),
          daily_cap: effectiveDailyCap(action, overrides, warmup),
          configured_daily: configuredDaily(action, overrides),
          hard_ceiling: spec.ceiling,
          used_this_week: usedThisWeek(state, now, action),
          weekly_cap: spec.weekly,
          daily_resets_at: nextLocalMidnight(now).toISOString(),
          weekly_resets_at: spec.weekly === null ? null : weeklyResetsAt(state, now, action).toISOString(),
        };
      }),
    };
  }

  private check(state: LimitsState, action: LimitAction, now: Date, amount: number): void {
    const spec = LIMIT_TABLE[action];
    const cap = effectiveDailyCap(action, this.overrides(), isWarmup(state, now));
    const today = usedOn(state, localDayKey(now), action);
    if (today + amount > cap) {
      const resetsAt = nextLocalMidnight(now);
      throw new LinkedInMcpError(
        "LIMIT_REACHED",
        `Daily limit reached for ${spec.label.toLowerCase()}: ${today} of ${cap} used today.`,
        `Wait until ${formatLocal(resetsAt)} for the daily limit to reset. Limits protect your account and are not queued.`,
        { action, window: "day", used: today, cap, resets_at: resetsAt.toISOString() },
      );
    }
    if (spec.weekly !== null) {
      const week = usedThisWeek(state, now, action);
      if (week + amount > spec.weekly) {
        const resetsAt = weeklyResetsAt(state, now, action);
        throw new LinkedInMcpError(
          "LIMIT_REACHED",
          `Weekly limit reached for ${spec.label.toLowerCase()}: ${week} of ${spec.weekly} used in the last 7 days.`,
          `Wait until ${formatLocal(resetsAt)}, when the oldest day drops out of the 7-day window.`,
          { action, window: "week", used: week, cap: spec.weekly, resets_at: resetsAt.toISOString() },
        );
      }
    }
  }

  /** Throws LIMIT_REACHED if `amount` more would exceed a cap. Does not count anything. */
  async assertAvailable(action: LimitAction, amount = 1): Promise<void> {
    const state = await this.read();
    this.check(state, action, this.clock(), amount);
  }

  /** Atomically checks and records usage. Throws LIMIT_REACHED without recording if over. */
  async consume(action: LimitAction, amount = 1): Promise<void> {
    await updateJson<LimitsState>(this.file, EMPTY_STATE, (current) => {
      const now = this.clock();
      const state = pruneDays({ ...EMPTY_STATE, ...current }, now);
      this.check(state, action, now, amount);
      const key = localDayKey(now);
      const day = { ...(state.days[key] ?? {}) };
      day[action] = (day[action] ?? 0) + amount;
      return { ...state, days: { ...state.days, [key]: day } };
    });
  }

  /** Starts the warm-up clock on the first successful sign-in. Idempotent. */
  async startWarmupIfNeeded(): Promise<void> {
    const state = await this.read();
    if (state.warmupStartedAt) return;
    await updateJson<LimitsState>(this.file, EMPTY_STATE, (current) => ({
      ...EMPTY_STATE,
      ...current,
      warmupStartedAt: current.warmupStartedAt ?? this.clock().toISOString(),
    }));
  }
}

/** Validates a set_limits request against the hard ceilings. */
export function validateLimitChanges(changes: LimitOverrides): void {
  for (const [action, value] of Object.entries(changes) as [LimitAction, number | undefined][]) {
    if (value === undefined) continue;
    const spec = LIMIT_TABLE[action];
    if (!spec) throw invalidInput(`Unknown limit "${action}".`);
    if (!Number.isInteger(value) || value < 0) throw invalidInput(`${action} must be a whole number of 0 or more.`);
    if (value > spec.ceiling) {
      throw invalidInput(`${action} cannot exceed the hard ceiling of ${spec.ceiling} per day.`, {
        action,
        requested: value,
        ceiling: spec.ceiling,
      });
    }
  }
}

/** Write actions only run inside working hours. Supports overnight windows like 22:00-06:00. */
export function assertWorkingHours(hours: Config["workingHours"], now: Date): void {
  if (hours === "off") return;
  const start = minutesOfDay(hours.start);
  const end = minutesOfDay(hours.end);
  const current = now.getHours() * 60 + now.getMinutes();
  const inside = start <= end ? current >= start && current < end : current >= start || current < end;
  if (inside) return;

  let next = atLocalTime(now, hours.start);
  if (next.getTime() <= now.getTime()) next = atLocalTime(addLocalDays(now, 1), hours.start);
  throw new LinkedInMcpError(
    "OUTSIDE_WORKING_HOURS",
    `Write actions only run between ${hours.start} and ${hours.end} local time.`,
    `Try again after ${formatLocal(next)}, or change workingHours in ~/.linkedin-mcp/config.json.`,
    { working_hours: hours, next_window_starts_at: next.toISOString() },
  );
}
