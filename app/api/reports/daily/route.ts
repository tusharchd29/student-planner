import { NextRequest, NextResponse } from "next/server";
import { callGroqJSON, todayContext } from "@/lib/groq";
import { guard } from "@/lib/apiGuard";
import { getUserTimezone } from "@/lib/userSettings";
import { todayISOInTZ } from "@/lib/timezone";

function buildSystemPrompt(tz: string): string {
  return `You write a short, punchy daily recap for a student based on
their planner data, and return ONLY a JSON object:

{ "report": "<the report text>" }

${todayContext(tz)}

Guidelines for the report text:
- 2 to 3 sentences. Casual, upbeat, confident — think a text from a friend
  who's proud of you, not a progress report. Short sentences.
- Lead with what got done today. If a streak is active, mention it. If
  something's overdue, say so plainly but kindly — no guilt-tripping.
- Personal/rest time is protection, not performance — frame it that way if
  relevant.
- Plain text only: no markdown, no bullet points. One or two emoji max,
  used naturally (not one per sentence).
- If literally nothing has happened yet today, keep it short and encouraging
  rather than padding with filler.`;
}

export async function POST(request: NextRequest) {
  const auth = await guard();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const { force } = await request.json().catch(() => ({ force: false }));

  const tz = await getUserTimezone(supabase, user.id);
  const today = todayISOInTZ(tz);

  if (!force) {
    const { data: cached } = await supabase
      .from("planner_daily_reports")
      .select("content, created_at")
      .eq("report_date", today)
      .maybeSingle();
    if (cached) {
      return NextResponse.json({
        report: cached.content,
        cached: true,
        generatedAt: cached.created_at,
      });
    }
  }

  const { data: allowed } = await supabase.rpc("planner_check_rate_limit", {
    p_bucket: "daily_report",
    p_limit: 10,
    p_window: "1 day",
  });
  if (allowed === false) {
    return NextResponse.json(
      { error: "You've regenerated today's recap several times. Try again later." },
      { status: 429 }
    );
  }

  const [{ data: completedToday }, { data: overdue }, { data: personal }] =
    await Promise.all([
      supabase
        .from("planner_flex_tasks")
        .select("title, deadline, duration_minutes, completed_at")
        .eq("done", true)
        .gte("completed_at", `${today}T00:00:00Z`),
      supabase
        .from("planner_flex_tasks")
        .select("title, deadline, duration_minutes")
        .eq("done", false)
        .lt("deadline", today),
      supabase
        .from("planner_personal_tasks")
        .select("title, weekly_quota_minutes, minutes_logged, week_start")
        .eq("done", false),
    ]);

  const { data: stats } = await supabase
    .from("planner_user_stats")
    .select("current_daily_streak, xp, level")
    .eq("user_id", user.id)
    .maybeSingle();

  const reportInput = {
    completed_today: completedToday ?? [],
    overdue: overdue ?? [],
    personal_time_logged_today: personal ?? [],
    current_daily_streak: stats?.current_daily_streak ?? 0,
  };

  let result: { report: string };
  try {
    result = await callGroqJSON(buildSystemPrompt(tz), JSON.stringify(reportInput));
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to generate recap" },
      { status: 502 }
    );
  }

  if (!result?.report) {
    return NextResponse.json(
      { error: "Recap generation returned no content" },
      { status: 502 }
    );
  }

  await supabase.from("planner_daily_reports").upsert(
    {
      user_id: user.id,
      report_date: today,
      content: result.report,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,report_date" }
  );

  return NextResponse.json({ report: result.report, cached: false });
}
