/**
 * Weeks run Friday 00:00 UTC → Thursday 23:59 UTC, so the Friday-morning brief
 * always describes a complete week. A week is identified by its opening Friday (YYYY-MM-DD).
 */
const DAY = 86_400_000;

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function weekStartOf(d: Date): string {
  const utc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = new Date(utc).getUTCDay(); // 0 Sun … 5 Fri
  const back = (dow - 5 + 7) % 7;
  return toISODate(new Date(utc - back * DAY));
}

export function addWeeks(week: string, n: number): string {
  return toISODate(new Date(Date.parse(week + "T00:00:00Z") + n * 7 * DAY));
}

/** The most recent week that has fully ended. */
export function lastCompleteWeek(now = new Date()): string {
  return addWeeks(weekStartOf(now), -1);
}

export function currentWeek(now = new Date()): string {
  return weekStartOf(now);
}

export function weekLabel(week: string): string {
  const start = new Date(week + "T00:00:00Z");
  const end = new Date(start.getTime() + 6 * DAY);
  const f = (d: Date, withMonth: boolean) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: withMonth ? "short" : undefined, timeZone: "UTC" });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${f(start, !sameMonth)}–${f(end, true)} ${end.getUTCFullYear()}`;
}

export function shortWeek(week: string): string {
  return new Date(week + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function daysAgo(n: number, now = new Date()): Date {
  return new Date(now.getTime() - n * DAY);
}

export function isWeek(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && weekStartOf(new Date(s + "T00:00:00Z")) === s;
}
