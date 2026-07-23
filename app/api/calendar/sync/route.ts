import { NextResponse } from "next/server";
import { google } from "googleapis";
import { guard } from "@/lib/apiGuard";
import { scheduleDay, minutesToTime } from "@/lib/scheduler";
import { getGoogleClientForUser } from "@/lib/googleAuth";
import { TABLE_BY_TYPE } from "@/lib/tables";
import { todayISOInAppTZ, dayOfWeekInAppTZ, weekStartISOInAppTZ, APP_TIMEZONE } from "@/lib/timezone";
import { computeReminders } from "@/lib/reminders";

export async function POST() {
  // Google Calendar quota is shared across ALL users of this Cloud project,
  // so one user spamming sync degrades everyone. Cap it per user.
  const auth = await guard({ bucket: "sync", limit: 30, window: "1 hour" });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const { client: oauth2Client, error: authError } =
    await getGoogleClientForUser(supabase, user.id);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const today = todayISOInAppTZ();
  const todayDow = dayOfWeekInAppTZ();
  const currentWeekStart = weekStartISOInAppTZ();

  const [{ data: fixedRows }, { data: flexRows }, { data: personalRows }] =
    await Promise.all([
      supabase.from("planner_fixed_events").select("*"),
      supabase
        .from("planner_flex_tasks")
        .select("*")
        .eq("done", false),
      supabase
        .from("planner_personal_tasks")
        .select("*")
        .eq("done", false),
    ]);

  // Only fixed events actually happening today (recurring by day_of_week,
  // a one-off event_date match, or legacy rows with neither set).
  const todaysFixed = (fixedRows ?? []).filter(
    (r: any) =>
      r.event_date === today ||
      (r.event_date == null && r.day_of_week === todayDow) ||
      (r.event_date == null && r.day_of_week == null)
  );

  const blocks = scheduleDay(
    todaysFixed.map((r: any) => ({
      id: r.id,
      title: r.title,
      start: minutesToTime(r.start_minutes),
      end: minutesToTime(r.end_minutes),
    })),
    (flexRows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      estimatedMinutes: r.duration_minutes,
      dueDate: r.deadline,
    })),
    (personalRows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      weeklyQuotaMinutes: r.weekly_quota_minutes ?? 0,
      minutesUsedThisWeek:
        r.week_start === currentWeekStart ? r.minutes_logged : 0,
    }))
  );

  // Lookup of each source row's existing google_event_id, so we update
  // an already-synced event instead of creating a duplicate every sync.
  const eventIdByRowId = new Map<string, string | null>();
  for (const rows of [fixedRows, flexRows, personalRows]) {
    for (const r of rows ?? []) eventIdByRowId.set(r.id, r.google_event_id);
  }

  // Duration/deadline metadata per row, used to scale reminder lead time
  // by urgency instead of a flat 10 minutes for everything (see lib/reminders.ts).
  const metaByRowId = new Map<
    string,
    { durationMinutes: number; deadline?: string }
  >();
  for (const r of flexRows ?? []) {
    metaByRowId.set(r.id, {
      durationMinutes: r.duration_minutes,
      deadline: r.deadline,
    });
  }
  for (const r of personalRows ?? []) {
    metaByRowId.set(r.id, { durationMinutes: r.duration_minutes ?? 30 });
  }

  const todayMidnight = new Date(`${today}T00:00:00`).getTime();

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const timeZone = APP_TIMEZONE;

  async function upsertEvent(block: (typeof blocks)[number]) {
    const meta = metaByRowId.get(block.sourceId);
    const daysUntilDue = meta?.deadline
      ? Math.round(
          (new Date(`${meta.deadline}T00:00:00`).getTime() - todayMidnight) /
            86400000
        )
      : undefined;

    const requestBody = {
      summary: block.title,
      start: { dateTime: `${today}T${block.start}:00`, timeZone },
      end: { dateTime: `${today}T${block.end}:00`, timeZone },
      reminders: {
        useDefault: false,
        overrides: computeReminders({
          type: block.type,
          durationMinutes: meta?.durationMinutes ?? 30,
          daysUntilDue,
        }),
      },
    };

    const existingEventId = eventIdByRowId.get(block.sourceId);
    const table = TABLE_BY_TYPE[block.type];

    if (existingEventId) {
      try {
        await calendar.events.update({
          calendarId: "primary",
          eventId: existingEventId,
          requestBody,
        });
        return;
      } catch (err: any) {
        // Event was likely deleted on the Google side — fall through to
        // creating a fresh one and re-storing its id.
        if (err?.code !== 404 && err?.response?.status !== 404) throw err;
      }
    }

    const inserted = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });
    if (inserted.data.id) {
      await supabase
        .from(table)
        .update({ google_event_id: inserted.data.id })
        .eq("id", block.sourceId);
    }
  }

  const results = await Promise.allSettled(blocks.map(upsertEvent));

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    console.error(
      "Some calendar syncs failed:",
      failed.map((f: any) => f.reason?.message)
    );
  }

  const firstError =
    failed.length > 0 ? (failed[0] as any).reason?.message : undefined;

  return NextResponse.json({
    synced: results.length - failed.length,
    failed: failed.length,
    firstError,
  });
}
