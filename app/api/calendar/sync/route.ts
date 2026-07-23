import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { scheduleDay, minutesToTime } from "@/lib/scheduler";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.provider_token) {
    return NextResponse.json(
      { error: "Not authenticated with Google" },
      { status: 401 }
    );
  }

  const [{ data: fixedRows }, { data: flexRows }, { data: personalRows }] =
    await Promise.all([
      supabase.from("planner_fixed_events").select("*"),
      supabase.from("planner_flex_tasks").select("*"),
      supabase.from("planner_personal_tasks").select("*"),
    ]);

  const blocks = scheduleDay(
    (fixedRows ?? []).map((r: any) => ({
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
      weeklyQuotaMinutes: r.weekly_quota_minutes,
    }))
  );

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: session.provider_token });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  const today = new Date().toISOString().slice(0, 10);

  const results = await Promise.allSettled(
    blocks.map((b) =>
      calendar.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: b.title,
          start: { dateTime: `${today}T${b.start}:00` },
          end: { dateTime: `${today}T${b.end}:00` },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 10 }],
          },
        },
      })
    )
  );

  const failed = results.filter((r) => r.status === "rejected").length;

  return NextResponse.json({ synced: results.length - failed, failed });
}
