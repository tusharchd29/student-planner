// Every date/day-of-week calculation in the app now takes an explicit
// timezone rather than assuming one. Previously this was hardcoded to
// Asia/Kolkata everywhere — fine for a single user in India, silently
// wrong (and silently DROPPING TASKS from view, per the bug we hit
// earlier) for anyone else. DEFAULT_TIMEZONE is only a fallback for rows
// that predate per-user settings; see lib/userSettings.ts for how the
// real per-user value is looked up.
export const DEFAULT_TIMEZONE = "Asia/Kolkata";

function partsInTZ(d: Date, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`, // YYYY-MM-DD
    weekday: get("weekday"),
  };
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export function todayISOInTZ(tz: string, d: Date = new Date()): string {
  return partsInTZ(d, tz).date;
}

export function dayOfWeekInTZ(tz: string, d: Date = new Date()): number {
  return WEEKDAY_INDEX[partsInTZ(d, tz).weekday];
}

export function weekdayNameInTZ(tz: string, d: Date = new Date()): string {
  return partsInTZ(d, tz).weekday;
}

export function addDaysISOInTZ(
  tz: string,
  daysFromNow: number,
  base: Date = new Date()
): string {
  const todayStr = todayISOInTZ(tz, base);
  const d = new Date(`${todayStr}T00:00:00`);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// Monday-anchored ISO week start, in the given timezone.
export function weekStartISOInTZ(tz: string, base: Date = new Date()): string {
  const dow = dayOfWeekInTZ(tz, base); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysISOInTZ(tz, diff, base);
}

// Validates a string is a real IANA timezone name Intl actually accepts,
// so a bad value (typo, injection attempt) can't silently corrupt date math.
export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
