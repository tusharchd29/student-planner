export type FixedEvent = {
  id: string;
  title: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
};

export type FlexTask = {
  id: string;
  title: string;
  estimatedMinutes: number;
  dueDate: string; // ISO date
};

export type PersonalTask = {
  id: string;
  title: string;
  weeklyQuotaMinutes: number;
  // Minutes already used this week (Mon–Sun), so the quota doesn't reset
  // to full every single day. Callers should track/pass this in.
  minutesUsedThisWeek?: number;
};

export type ScheduledBlock = {
  id: string;
  // The underlying task row this block came from — a block never gets a
  // composite string id anymore (previous version tried encoding the
  // source id + offset into `id`, which silently broke because task ids
  // are UUIDs already full of dashes).
  sourceId: string;
  title: string;
  start: string;
  end: string;
  type: "fixed" | "flex" | "personal";
};

// Converts between the DB's minutes-since-midnight ints and "HH:MM" strings.
export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

// Monday-anchored week starts are now computed in lib/timezone.ts
// (weekStartISOInAppTZ), which is timezone-aware — this file's version was
// superseded because it used the server's raw system clock, which drifted
// against the user's actual local day near midnight IST.

/**
 * Greedy day scheduler:
 * 1. Fixed events anchor the day and are never moved.
 * 2. Personal tasks get protected slots first (up to their remaining
 *    weekly quota), so rest/hobbies aren't crowded out by academic urgency.
 * 3. Flexible academic tasks fill whatever open time remains, ordered
 *    by due-date urgency (soonest deadline first).
 */
export function scheduleDay(
  fixed: FixedEvent[],
  flex: FlexTask[],
  personal: PersonalTask[],
  dayStart = "07:00",
  dayEnd = "22:00"
): ScheduledBlock[] {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const toTime = (mins: number) => {
    const h = Math.floor(mins / 60)
      .toString()
      .padStart(2, "0");
    const m = (mins % 60).toString().padStart(2, "0");
    return `${h}:${m}`;
  };

  const blocks: ScheduledBlock[] = fixed
    .map((f) => ({
      id: f.id,
      sourceId: f.id,
      title: f.title,
      start: f.start,
      end: f.end,
      type: "fixed" as const,
    }))
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));

  // Compute open gaps between dayStart/dayEnd around fixed blocks.
  const gaps: [number, number][] = [];
  let cursor = toMinutes(dayStart);
  for (const b of blocks) {
    const s = toMinutes(b.start);
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, toMinutes(b.end));
  }
  if (cursor < toMinutes(dayEnd)) gaps.push([cursor, toMinutes(dayEnd)]);

  // Personal tasks claim time first, bounded by remaining weekly quota
  // (quota minus whatever's already been used this week).
  const personalQueue = personal
    .map((p) => ({
      ...p,
      remaining: Math.max(
        0,
        p.weeklyQuotaMinutes - (p.minutesUsedThisWeek ?? 0)
      ),
    }))
    .filter((p) => p.remaining > 0);

  for (const gap of gaps) {
    let [gs, ge] = gap;
    while (personalQueue.length && ge - gs > 0) {
      const p = personalQueue[0];
      const chunk = Math.min(p.remaining, ge - gs);
      if (chunk <= 0) break;
      blocks.push({
        id: `${p.id}-${gs}`,
        sourceId: p.id,
        title: p.title,
        start: toTime(gs),
        end: toTime(gs + chunk),
        type: "personal",
      });
      gs += chunk;
      p.remaining -= chunk;
      if (p.remaining <= 0) personalQueue.shift();
    }
    gap[0] = gs;
  }

  // Flexible academic tasks fill the rest, most urgent first.
  const flexQueue = [...flex]
    .map((f) => ({ ...f }))
    .sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
    );
  for (const gap of gaps) {
    let [gs, ge] = gap;
    while (flexQueue.length && ge - gs > 0) {
      const t = flexQueue[0];
      const chunk = Math.min(t.estimatedMinutes, ge - gs);
      if (chunk <= 0) break;
      blocks.push({
        id: `${t.id}-${gs}`,
        sourceId: t.id,
        title: t.title,
        start: toTime(gs),
        end: toTime(gs + chunk),
        type: "flex",
      });
      gs += chunk;
      t.estimatedMinutes -= chunk;
      if (t.estimatedMinutes <= 0) flexQueue.shift();
    }
  }

  return blocks.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}
