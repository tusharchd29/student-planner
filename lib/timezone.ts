// The whole app currently hardcodes one timezone rather than storing a
// per-user preference (a known gap — see audit notes). Centralizing it here
// at least means every date calculation (server routes running on Vercel's
// UTC clock, and the browser client) agrees on what "today" means, instead
// of drifting against each other near midnight IST.
export const APP_TIMEZONE = "Asia/Kolkata";

function partsInTZ(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
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

export function todayISOInAppTZ(d: Date = new Date()): string {
  return partsInTZ(d).date;
}

export function dayOfWeekInAppTZ(d: Date = new Date()): number {
  return WEEKDAY_INDEX[partsInTZ(d).weekday];
}

export function weekdayNameInAppTZ(d: Date = new Date()): string {
  return partsInTZ(d).weekday;
}

export function addDaysISOInAppTZ(daysFromNow: number, base: Date = new Date()): string {
  // Compute in the app timezone's "today", then add whole days — avoids DST/
  // offset edge cases since we're just doing calendar-date arithmetic.
  const todayStr = todayISOInAppTZ(base);
  const d = new Date(`${todayStr}T00:00:00`);
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

// Monday-anchored ISO week start, in the app timezone.
export function weekStartISOInAppTZ(base: Date = new Date()): string {
  const dow = dayOfWeekInAppTZ(base); // 0 = Sunday
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDaysISOInAppTZ(diff, base);
}
