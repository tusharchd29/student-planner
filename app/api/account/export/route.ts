import { NextResponse } from "next/server";
import { guard } from "@/lib/apiGuard";

// Returns everything we have on the requesting user, across every planner
// table, as a single JSON document they can download. Deliberately does
// NOT include planner_google_tokens (even decrypted, an OAuth refresh
// token isn't "your data" in the sense of something useful to export —
// it's a live credential, and including it would mean handing out a
// working Google Calendar access token in a downloadable file).
export async function GET() {
  const auth = await guard();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const [fixed, flex, personal, settings, reports] = await Promise.all([
    supabase.from("planner_fixed_events").select("*"),
    supabase.from("planner_flex_tasks").select("*"),
    supabase.from("planner_personal_tasks").select("*"),
    supabase.from("planner_user_settings").select("*"),
    supabase.from("planner_weekly_reports").select("week_start, content, created_at"),
  ]);

  const exportData = {
    exported_at: new Date().toISOString(),
    user: { id: user.id, email: user.email },
    fixed_events: fixed.data ?? [],
    flex_tasks: flex.data ?? [],
    personal_tasks: personal.data ?? [],
    settings: settings.data ?? [],
    weekly_reports: reports.data ?? [],
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="student-planner-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
    },
  });
}
