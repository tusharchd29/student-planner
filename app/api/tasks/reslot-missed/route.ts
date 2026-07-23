import { NextResponse } from "next/server";
import { callGroqJSON, todayContext } from "@/lib/groq";
import { todayISOInAppTZ, addDaysISOInAppTZ } from "@/lib/timezone";
import { guard } from "@/lib/apiGuard";

const SYSTEM_PROMPT = `You are helping re-slot missed student tasks.

${todayContext()}

You'll be given two lists as JSON:
- "missed": tasks whose deadline has already passed and aren't done
- "upcoming": tasks already scheduled over the next 7 days (for context, so
  you don't pile everything onto one day)

Return ONLY a JSON object of the form:
{
  "reslots": [{ "id": "<task id>", "new_deadline": "YYYY-MM-DD" }, ...],
  "summary": "<one short, friendly sentence for the student, e.g.
              'Moved 2 tasks to tomorrow and Thursday to spread out your week.'>"
}

Rules:
- Every missed task must get exactly one new_deadline, strictly after today.
- Spread tasks across the next few days rather than dumping them all on the
  same day, especially if "upcoming" already has tasks on a given day.
- Never move a task's deadline earlier than tomorrow.
- Keep the summary under 20 words.`;

export async function POST() {
  // Auth only here — the throttle check happens *after* we've confirmed
  // there's actually work to do, so a user with no overdue tasks doesn't
  // burn their once-a-day allowance on a no-op.
  const auth = await guard();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const today = todayISOInAppTZ();

  const [{ data: missed }, { data: upcoming }] = await Promise.all([
    supabase
      .from("planner_flex_tasks")
      .select("id, title, deadline, duration_minutes")
      .eq("done", false)
      .lt("deadline", today)
      .order("deadline", { ascending: true })
      .limit(50),
    supabase
      .from("planner_flex_tasks")
      .select("id, title, deadline, duration_minutes")
      .eq("done", false)
      .gte("deadline", today)
      .lte("deadline", addDaysISOInAppTZ(7))
      .limit(50),
  ]);

  if (!missed || missed.length === 0) {
    return NextResponse.json({ reslotted: 0, summary: null });
  }

  // Only now that we know there IS work do we spend the daily allowance.
  // This route previously fired a Groq call on *every* dashboard load for
  // anyone with an overdue task — slow for the user, expensive for us.
  const { data: allowed } = await supabase.rpc("planner_check_rate_limit", {
    p_bucket: "reslot",
    p_limit: 1,
    p_window: "1 day",
  });

  if (allowed === false) {
    return NextResponse.json({ reslotted: 0, summary: null, throttled: true });
  }

  let plan: { reslots: { id: string; new_deadline: string }[]; summary: string };
  try {
    plan = await callGroqJSON(
      SYSTEM_PROMPT,
      JSON.stringify({ missed, upcoming: upcoming ?? [] })
    );
  } catch (err: any) {
    console.error("Re-slot failed:", err);
    return NextResponse.json(
      { error: "Couldn't re-slot missed tasks right now." },
      { status: 502 }
    );
  }

  const updates = await Promise.allSettled(
    (plan.reslots ?? []).map((r) =>
      supabase
        .from("planner_flex_tasks")
        .update({ deadline: r.new_deadline })
        .eq("id", r.id)
    )
  );

  const failed = updates.filter((u) => u.status === "rejected").length;

  return NextResponse.json({
    reslotted: (plan.reslots ?? []).length - failed,
    summary: plan.summary ?? null,
  });
}
