import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getGoogleClientForUser } from "@/lib/googleAuth";

export async function POST(request: NextRequest) {
  const { eventId } = await request.json();
  if (!eventId) {
    return NextResponse.json({ error: "No eventId provided" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
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
