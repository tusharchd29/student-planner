import { NextResponse } from "next/server";
import { weekStartISOInTZ } from "@/lib/timezone";
import { guard } from "@/lib/apiGuard";
import { getUserTimezone } from "@/lib/userSettings";

// Detects personal tasks whose tracked week has ended, evaluates whether
// the weekly quota was actually met, and updates their streak — then
// resets them to a fresh (empty) week. Meant to be called once per
// dashboard load; it's a no-op for tasks already on the current week.
export async function POST() {
  const auth = await guard();
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }
  const { supabase, user } = auth;

  const tz = await getUserTimezone(supabase, user.id);
  const currentWeekStart = weekStartISOInTZ(tz);

  const { data: rows } = await supabase
    .from("planner_personal_tasks")
    .select(
      "id, title, week_start, minutes_logged, weekly_quota_minutes, current_streak, longest_streak"
    )
    .not("week_start", "is", null)
    .neq("week_start", currentWeekStart);

  if (!rows || rows.length === 0) {
    return NextResponse.json({ rolled: 0, changes: [] });
  }

  const changes: { title: string; streak: number; met: boolean }[] = [];

  const updates = rows.map((r: any) => {
    const quota = r.weekly_quota_minutes ?? 0;
    const met = quota > 0 && r.minutes_logged >= quota;
    const newStreak = met ? r.current_streak + 1 : 0;
    const newLongest = Math.max(r.longest_streak, newStreak);

    changes.push({ title: r.title, streak: newStreak, met });

    return supabase
      .from("planner_personal_tasks")
      .update({
        week_start: currentWeekStart,
        minutes_logged: 0,
        current_streak: newStreak,
        longest_streak: newLongest,
      })
      .eq("id", r.id);
  });

  await Promise.allSettled(updates);

  return NextResponse.json({ rolled: changes.length, changes });
}
