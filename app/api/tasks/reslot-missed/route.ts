import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { callGroqJSON, todayContext } from "@/lib/groq";

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
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const [{ data: missed }, { data: upcoming }] = await Promise.all([
    supabase
      .from("planner_flex_tasks")
      .select("id, title, deadline, duration_minutes")
      .eq("done", false)
      .lt("deadline", today),
    supabase
      .from("planner_flex_tasks")
      .select("id, title, deadline, duration_minutes")
      .eq("done", false)
      .gte("deadline", today),
  ]);

  if (!missed || missed.length === 0) {
    return NextResponse.json({ reslotted: 0, summary: null });
  }

  let plan: { reslots: { id: string; new_deadline: string }[]; summary: string };
  try {
    plan = await callGroqJSON(
      SYSTEM_PROMPT,
      JSON.stringify({ missed, upcoming: upcoming ?? [] })
    );
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to re-slot tasks" },
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
