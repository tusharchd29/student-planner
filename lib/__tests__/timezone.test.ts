import { describe, it, expect } from "vitest";
import {
  todayISOInTZ,
  dayOfWeekInTZ,
  weekdayNameInTZ,
  addDaysISOInTZ,
  weekStartISOInTZ,
  isValidTimeZone,
} from "../timezone";

// This file exists because we shipped two real bugs from exactly this
// module: (1) the server ran on UTC while the user was in IST, so "today"
// silently disagreed between browser and server near midnight IST, and
// (2) an earlier version asked Groq to compute "tomorrow" itself instead
// of being handed the precomputed date, which it got wrong. Both bugs
// were about date/timezone math being subtly incorrect, not obviously
// broken — exactly the kind of thing that needs tests, not just manual
// clicking, to catch on the next change.

describe("todayISOInTZ", () => {
  it("returns the correct date for a UTC timestamp that's already 'tomorrow' in IST", () => {
    // 2026-01-15 20:00 UTC = 2026-01-16 01:30 IST (UTC+5:30) — this exact
    // kind of near-midnight boundary is what caused the original bug.
    const d = new Date("2026-01-15T20:00:00Z");
    expect(todayISOInTZ("Asia/Kolkata", d)).toBe("2026-01-16");
    expect(todayISOInTZ("UTC", d)).toBe("2026-01-15");
  });

  it("agrees with the wall-clock date in a timezone with a negative offset", () => {
    // 2026-01-16 02:00 UTC = 2026-01-15 18:00 in America/Los_Angeles (UTC-8)
    const d = new Date("2026-01-16T02:00:00Z");
    expect(todayISOInTZ("America/Los_Angeles", d)).toBe("2026-01-15");
    expect(todayISOInTZ("UTC", d)).toBe("2026-01-16");
  });
});

describe("dayOfWeekInTZ", () => {
  it("returns 0 for Sunday and 6 for Saturday, matching JS Date.getDay() convention", () => {
    // 2026-01-18 is a Sunday.
    const sunday = new Date("2026-01-18T12:00:00Z");
    expect(dayOfWeekInTZ("UTC", sunday)).toBe(0);

    // 2026-01-24 is a Saturday.
    const saturday = new Date("2026-01-24T12:00:00Z");
    expect(dayOfWeekInTZ("UTC", saturday)).toBe(6);
  });

  it("can differ from the UTC day of week across a timezone boundary", () => {
    // 2026-01-18 23:00 UTC (Sunday) = 2026-01-19 04:30 IST (Monday) — the
    // exact class of bug that caused fixed-event recurrence to silently
    // miss/hit the wrong day for non-UTC users.
    const d = new Date("2026-01-18T23:00:00Z");
    expect(dayOfWeekInTZ("UTC", d)).toBe(0); // Sunday
    expect(dayOfWeekInTZ("Asia/Kolkata", d)).toBe(1); // Monday
  });
});

describe("addDaysISOInTZ", () => {
  it("adds whole calendar days relative to the timezone's current date", () => {
    const d = new Date("2026-01-15T20:00:00Z"); // 2026-01-16 in IST
    expect(addDaysISOInTZ("Asia/Kolkata", 0, d)).toBe("2026-01-16");
    expect(addDaysISOInTZ("Asia/Kolkata", 1, d)).toBe("2026-01-17");
    expect(addDaysISOInTZ("Asia/Kolkata", 7, d)).toBe("2026-01-23");
  });

  it("supports negative offsets for looking backward", () => {
    const d = new Date("2026-01-16T00:00:00Z");
    expect(addDaysISOInTZ("UTC", -7, d)).toBe("2026-01-09");
  });

  it("handles month and year boundaries correctly", () => {
    const d = new Date("2026-01-31T12:00:00Z");
    expect(addDaysISOInTZ("UTC", 1, d)).toBe("2026-02-01");

    const nyEve = new Date("2026-12-31T12:00:00Z");
    expect(addDaysISOInTZ("UTC", 1, nyEve)).toBe("2027-01-01");
  });
});

describe("weekStartISOInTZ", () => {
  it("anchors to Monday for every day of the week", () => {
    // Week of 2026-01-19 (Mon) through 2026-01-25 (Sun).
    const monday = new Date("2026-01-19T12:00:00Z");
    const wednesday = new Date("2026-01-21T12:00:00Z");
    const sunday = new Date("2026-01-25T12:00:00Z");

    expect(weekStartISOInTZ("UTC", monday)).toBe("2026-01-19");
    expect(weekStartISOInTZ("UTC", wednesday)).toBe("2026-01-19");
    expect(weekStartISOInTZ("UTC", sunday)).toBe("2026-01-19");
  });

  it("rolls over to the next week's Monday right after Sunday", () => {
    const nextMonday = new Date("2026-01-26T12:00:00Z");
    expect(weekStartISOInTZ("UTC", nextMonday)).toBe("2026-01-26");
  });
});

describe("isValidTimeZone", () => {
  it("accepts real IANA timezone names", () => {
    expect(isValidTimeZone("Asia/Kolkata")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects garbage input instead of throwing downstream", () => {
    // This matters because a corrupted/malicious value in
    // planner_user_settings.timezone should fail safe (fall back to
    // DEFAULT_TIMEZONE via lib/userSettings.ts) rather than crash every
    // date calculation in the app.
    expect(isValidTimeZone("not/a/timezone")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone("DROP TABLE users;")).toBe(false);
  });
});
