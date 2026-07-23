export type FixedEvent = {
  id: string;
  title: string;
  start: string; // ISO time, e.g. "08:00"
  end: string; // ISO time, e.g. "14:00"
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
};

export type ScheduledBlock = {
  id: string;
  title: string;
  start: string;
  end: string;
  type: "fixed" | "flex" | "personal";
};

/**
 * Greedy day scheduler:
 * 1. Fixed events anchor the day and are never moved.
 * 2. Personal tasks get protected slots first, so rest/hobbies aren't
 *    crowded out by academic urgency.
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

  // Personal tasks claim time first (protected, quota-based).
  const personalQueue = [...personal];
  for (const gap of gaps) {
    let [gs, ge] = gap;
    while (personalQueue.length && ge - gs > 0) {
      const p = personalQueue[0];
      const chunk = Math.min(p.weeklyQuotaMinutes, ge - gs);
      if (chunk <= 0) break;
      blocks.push({
        id: `${p.id}-${gs}`,
        title: p.title,
        start: toTime(gs),
        end: toTime(gs + chunk),
        type: "personal",
      });
      gs += chunk;
      p.weeklyQuotaMinutes -= chunk;
      if (p.weeklyQuotaMinutes <= 0) personalQueue.shift();
    }
    gap[0] = gs;
  }

  // Flexible academic tasks fill the rest, most urgent first.
  const flexQueue = [...flex].sort(
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
