export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD in the machine's local timezone. */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local midnight at the start of the given day key. */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
  return next;
}

export function nextLocalMidnight(date: Date): Date {
  return addLocalDays(date, 1);
}

export function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

export function atLocalTime(date: Date, hhmm: string): Date {
  const minutes = minutesOfDay(hhmm);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), Math.floor(minutes / 60), minutes % 60, 0, 0);
}

export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function localLocale(): string {
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

/** "2026-11-24 14:30 (Europe/London)" style string for previews. */
export function formatLocal(date: Date): string {
  return `${localDayKey(date)} ${pad(date.getHours())}:${pad(date.getMinutes())} (${localTimeZone()})`;
}
