import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { callGroqJSON, todayContext } from "@/lib/groq";
import {
  todayISOInAppTZ,
  addDaysISOInAppTZ,
  weekStartISOInAppTZ,
} from "@/lib/timezone";

const SYSTEM_PROMPT = `You write a short, friendly weekly review for a student
based on their planner data, and return ONLY a JSON object:

{ "report": "<the report text>" }

${todayContext()}

Guidelines for the report text:
- 3 to 6 sentences, warm and encouraging but honest — don't sugarcoat
  overdue work, but never shame.
- Lead with what went well (completed tasks, streaks kept), then what
  needs attention (overdue tasks, streaks lost), then one concrete,
  gentle suggestion for the coming week based on upcoming deadlines.
- Personal/rest time is about protection, not performance: if quotas were
  met, frame it as "you protected your downtime", never as productivity.
- Mention specific task titles where it helps, but don't list everything.
- Plain text only: no markdown, no bullet points, no emoji spam (one 🔥
  for a notable streak is fine).`;

export async function POST(request: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { force } = await request.json().catch(() => ({ force: false }));

  const weekStart = weekStartISOInAppTZ();

  // Serve the cached report for this week unless a regeneration was asked for.
  if (!force) {
    const { data: cached } = await supabase
      .from("planner_weekly_reports")
      .select("content, created_at")
      .eq("week_start", weekStart)
      .maybeSingle();
    if (cached) {
      return NextResponse.json({
        report: cached.content,
        cached: true,
        generatedAt: cached.created_at,
      });
    }
  }

  const today = todayISOInAppTZ();
  const sevenDaysAgo = addDaysISOInAppTZ(-7);
  const sevenDaysAhead = addDaysISOInAppTZ(7);

  const [
    { data: completed },
    { data: overdue },
    { data: upcoming },
    { data: personal },
  ] = await Promise.all([
    supabase
      .from("planner_flex_tasks")
      .select("title, deadline, duration_minutes, completed_at")
      .eq("done", true)
      .gte("completed_at", `${sevenDaysAgo}T00:00:00Z`),
    supabase
      .from("planner_flex_tasks")
      .select("title, deadline, duration_minutes")
      .eq("done", false)
      .lt("deadline", today),
    supabase
      .from("planner_flex_tasks")
      .select("title, deadline, duration_minutes")
      .eq("done", false)
      .gte("deadline", today)
      .lte("deadline", sevenDaysAhead),
    supabase
      .from("planner_personal_tasks")
      .select(
        "title, weekly_quota_minutes, minutes_logged, week_start, current_streak, longest_streak"
      )
      .eq("done", false),
  ]);

  const reportInput = {
    completed_this_week: completed ?? [],
    overdue: overdue ?? [],
    upcoming_week_deadlines: upcoming ?? [],
    personal_time: (personal ?? []).map((p: any) => ({
      title: p.title,
      quota_minutes: p.weekly_quota_minutes,
      logged_this_week: p.week_start === weekStart ? p.minutes_logged : 0,
      current_streak_weeks: p.current_streak,
      longest_streak_weeks: p.longest_streak,
    })),
  };

  let result: { report: string };
  try {
    result = await callGroqJSON(SYSTEM_PROMPT, JSON.stringify(reportInput));
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to generate report" },
      { status: 502 }
    );
  }

  if (!result?.report) {
    return NextResponse.json(
      { error: "Report generation returned no content" },
      { status: 502 }
    );
  }

  await supabase.from("planner_weekly_reports").upsert(
    {
      user_id: user.id,
      week_start: weekStart,
      content: result.report,
      created_at: new Date().toISOString(),
    },
    { onConflict: "user_id,week_start" }
  );

  return NextResponse.json({ report: result.report, cached: false });
}
