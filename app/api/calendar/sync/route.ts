import { NextResponse } from "next/server";
import { google } from "googleapis";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { scheduleDay, minutesToTime } from "@/lib/scheduler";

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data: tokenRow, error: tokenError } = await supabase
    .from("planner_google_tokens")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return NextResponse.json(
      {
        error:
          "No Google Calendar connection found. Please sign out and sign in again to grant calendar access.",
      },
      { status: 401 }
    );
  }

  if (!tokenRow.refresh_token) {
    return NextResponse.json(
      {
        error:
          "Google didn't return a refresh token last time you signed in (this can happen on repeat logins). Please sign out, revoke access at https://myaccount.google.com/permissions, and sign in again.",
      },
      { status: 401 }
    );
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.client_id,
    process.env.client_secret
  );
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
  });

  // Proactively refresh — cheap, and avoids a failed call if the stored
  // access token has expired since last sync.
  try {
    const { credentials } = await oauth2Client.refreshAccessToken();
    oauth2Client.setCredentials(credentials);
    await supabase
      .from("planner_google_tokens")
      .update({
        access_token: credentials.access_token,
        expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          "Google rejected the stored refresh token. Please sign out and sign in again.",
      },
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

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length) {
    console.error(
      "Some calendar inserts failed:",
      failed.map((f: any) => f.reason?.message)
    );
  }

  return NextResponse.json({
    synced: results.length - failed.length,
    failed: failed.length,
  });
}
