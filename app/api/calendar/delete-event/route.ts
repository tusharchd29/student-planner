import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { guard } from "@/lib/apiGuard";
import { getGoogleClientForUser } from "@/lib/googleAuth";

export async function POST(request: NextRequest) {
  // Auth before touching the body — never do work for an unauthenticated caller.
  const auth = await guard({ bucket: "delete_event", limit: 100, window: "1 hour" });
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const { eventId } = await request.json().catch(() => ({ eventId: null }));
  if (!eventId || typeof eventId !== "string") {
    return NextResponse.json({ error: "No eventId provided" }, { status: 400 });
  }

  // Confirm this event id is actually one we synced for this user. RLS
  // already scopes these reads to the caller, so a forged id simply won't
  // match anything. Without this, the route would forward an arbitrary
  // caller-supplied id straight to Google.
  const ownershipChecks = await Promise.all([
    supabase.from("planner_fixed_events").select("id").eq("google_event_id", eventId).limit(1),
    supabase.from("planner_flex_tasks").select("id").eq("google_event_id", eventId).limit(1),
    supabase.from("planner_personal_tasks").select("id").eq("google_event_id", eventId).limit(1),
  ]);

  const owned = ownershipChecks.some((r) => (r.data?.length ?? 0) > 0);
  if (!owned) {
    return NextResponse.json(
      { error: "Event not found for this account" },
      { status: 404 }
    );
  }

  const { client: oauth2Client, error: authError } =
    await getGoogleClientForUser(supabase, user.id);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: 401 });
  }

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  try {
    await calendar.events.delete({ calendarId: "primary", eventId });
  } catch (err: any) {
    // Already gone on Google's side is fine — the end state we want either way.
    if (err?.code !== 404 && err?.response?.status !== 410) {
      return NextResponse.json(
        { error: err.message ?? "Failed to delete calendar event" },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ ok: true });
}
