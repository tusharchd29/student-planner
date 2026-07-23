import { describe, it, expect } from "vitest";
import {
  scheduleDay,
  minutesToTime,
  timeToMinutes,
  type FixedEvent,
  type FlexTask,
  type PersonalTask,
} from "../scheduler";

describe("minutesToTime / timeToMinutes", () => {
  it("round-trip correctly", () => {
    expect(minutesToTime(540)).toBe("09:00");
    expect(minutesToTime(0)).toBe("00:00");
    expect(minutesToTime(1439)).toBe("23:59");
    expect(timeToMinutes("09:00")).toBe(540);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });
});

describe("scheduleDay", () => {
  it("places fixed events at their exact given times, unmoved", () => {
    const fixed: FixedEvent[] = [
      { id: "f1", title: "Math class", start: "09:00", end: "10:00" },
    ];
    const blocks = scheduleDay(fixed, [], []);
    const mathBlock = blocks.find((b) => b.sourceId === "f1");
    expect(mathBlock).toMatchObject({
      title: "Math class",
      start: "09:00",
      end: "10:00",
      type: "fixed",
    });
  });

  it("never overlaps a flex task into a fixed event's time slot", () => {
    const fixed: FixedEvent[] = [
      { id: "f1", title: "Math class", start: "09:00", end: "10:00" },
    ];
    const flex: FlexTask[] = [
      { id: "t1", title: "Long essay", estimatedMinutes: 300, dueDate: "2026-01-20" },
    ];
    const blocks = scheduleDay(fixed, flex, []);

    const fixedBlock = blocks.find((b) => b.type === "fixed")!;
    const fixedStart = timeToMinutes(fixedBlock.start);
    const fixedEnd = timeToMinutes(fixedBlock.end);

    for (const b of blocks.filter((b) => b.type === "flex")) {
      const s = timeToMinutes(b.start);
      const e = timeToMinutes(b.end);
      const overlaps = s < fixedEnd && e > fixedStart;
      expect(overlaps).toBe(false);
    }
  });

  it("orders flex tasks by soonest deadline first", () => {
    const flex: FlexTask[] = [
      { id: "later", title: "Due later", estimatedMinutes: 60, dueDate: "2026-02-01" },
      { id: "sooner", title: "Due sooner", estimatedMinutes: 60, dueDate: "2026-01-20" },
    ];
    const blocks = scheduleDay([], flex, []);
    const sooner = blocks.find((b) => b.sourceId === "sooner")!;
    const later = blocks.find((b) => b.sourceId === "later")!;
    expect(timeToMinutes(sooner.start)).toBeLessThan(timeToMinutes(later.start));
  });

  it("protects personal time up to the remaining weekly quota before flex tasks fill the same window", () => {
    const personal: PersonalTask[] = [
      { id: "p1", title: "Guitar practice", weeklyQuotaMinutes: 60 },
    ];
    const flex: FlexTask[] = [
      { id: "t1", title: "Homework", estimatedMinutes: 600, dueDate: "2026-01-20" },
    ];
    const blocks = scheduleDay([], flex, personal, "07:00", "22:00");

    const personalBlock = blocks.find((b) => b.type === "personal");
    expect(personalBlock).toBeDefined();
    expect(personalBlock!.start).toBe("07:00"); // claims the day's first slot

    const personalMinutes = blocks
      .filter((b) => b.type === "personal")
      .reduce((sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)), 0);
    expect(personalMinutes).toBe(60);
  });

  it("honors minutesUsedThisWeek so quota doesn't reset to full every day", () => {
    // Quota is 60, already used 45 this week — only 15 should remain.
    const personal: PersonalTask[] = [
      {
        id: "p1",
        title: "Guitar practice",
        weeklyQuotaMinutes: 60,
        minutesUsedThisWeek: 45,
      },
    ];
    const blocks = scheduleDay([], [], personal, "07:00", "22:00");
    const personalMinutes = blocks
      .filter((b) => b.type === "personal")
      .reduce((sum, b) => sum + (timeToMinutes(b.end) - timeToMinutes(b.start)), 0);
    expect(personalMinutes).toBe(15);
  });

  it("schedules nothing for a personal task whose weekly quota is already fully used", () => {
    const personal: PersonalTask[] = [
      {
        id: "p1",
        title: "Guitar practice",
        weeklyQuotaMinutes: 60,
        minutesUsedThisWeek: 60,
      },
    ];
    const blocks = scheduleDay([], [], personal);
    expect(blocks.filter((b) => b.type === "personal")).toHaveLength(0);
  });

  it("splits a task across multiple gaps when fixed events interrupt the day, and every chunk keeps the correct sourceId", () => {
    const fixed: FixedEvent[] = [
      { id: "f1", title: "Class", start: "10:00", end: "16:00" },
    ];
    const flex: FlexTask[] = [
      { id: "t1", title: "Big project", estimatedMinutes: 480, dueDate: "2026-01-20" },
    ];
    const blocks = scheduleDay(fixed, flex, [], "07:00", "22:00");
    const flexChunks = blocks.filter((b) => b.type === "flex");

    // Should be split into at least two chunks (before and after the class).
    expect(flexChunks.length).toBeGreaterThanOrEqual(2);
    // Every chunk must trace back to the same source task — this is the
    // exact bug that was fixed by adding an explicit sourceId field
    // instead of encoding it into a composite string id (task ids are
    // UUIDs already full of dashes, which made the old encoding ambiguous).
    for (const chunk of flexChunks) {
      expect(chunk.sourceId).toBe("t1");
    }
  });

  it("returns blocks sorted chronologically by start time regardless of input order", () => {
    const fixed: FixedEvent[] = [
      { id: "f1", title: "Afternoon class", start: "14:00", end: "15:00" },
    ];
    const flex: FlexTask[] = [
      { id: "t1", title: "Morning task", estimatedMinutes: 30, dueDate: "2026-01-20" },
    ];
    const blocks = scheduleDay(fixed, flex, []);
    const starts = blocks.map((b) => timeToMinutes(b.start));
    const sorted = [...starts].sort((a, b) => a - b);
    expect(starts).toEqual(sorted);
  });

  it("returns an empty schedule when given no tasks at all", () => {
    expect(scheduleDay([], [], [])).toEqual([]);
  });
});
