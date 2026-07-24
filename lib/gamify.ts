import type { SupabaseClient } from "@supabase/supabase-js";
import { todayISOInTZ, addDaysISOInTZ } from "./timezone";

// Level titles — identity-flavored rather than just "Level N", since a
// number nobody looks at doesn't do much. Thresholds are cumulative XP.
export const LEVELS: { threshold: number; title: string }[] = [
  { threshold: 0, title: "Getting Started" },
  { threshold: 100, title: "Building Momentum" },
  { threshold: 300, title: "In The Zone" },
  { threshold: 700, title: "Locked In" },
  { threshold: 1500, title: "On A Heater" },
  { threshold: 3000, title: "Certified Lock" },
  { threshold: 6000, title: "Main Character" },
];

export function levelForXP(xp: number): { level: number; title: string; next: number | null } {
  let level = 1;
  let title = LEVELS[0].title;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].threshold) {
      level = i + 1;
      title = LEVELS[i].title;
    }
  }
  const next = LEVELS[level]?.threshold ?? null; // null once at max level
  return { level, title, next };
}

// XP awarded per action. Flex tasks and personal time are weighted by
// duration (in 15-min steps) so a 2-hour essay is worth more than a
// 15-minute chore, capped so no single task dominates.
export function xpForDuration(minutes: number): number {
  return Math.min(60, 10 + Math.round(minutes / 15) * 5);
}

/**
 * Call after any task/personal-time completion. Awards XP, and rolls the
 * daily streak forward if this is the first completion logged today
 * (streak continues on consecutive days, resets to 1 if a day was missed).
 * Best-effort: failures here should never block the underlying task action.
 */
export async function recordCompletion(
  supabase: SupabaseClient,
  userId: string,
  tz: string,
  xpAmount: number
) {
  const today = todayISOInTZ(tz);
  const yesterday = addDaysISOInTZ(tz, -1);

  const { data: existing } = await supabase
    .from("planner_user_stats")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const prevXP = existing?.xp ?? 0;
  const newXP = prevXP + xpAmount;
  const { level } = levelForXP(newXP);

  let currentStreak = existing?.current_daily_streak ?? 0;
  let longestStreak = existing?.longest_daily_streak ?? 0;
  const lastActive = existing?.last_active_date ?? null;

  if (lastActive === today) {
    // Already logged something today — streak unchanged, just add XP.
  } else if (lastActive === yesterday) {
    currentStreak += 1;
  } else {
    currentStreak = 1;
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  await supabase.from("planner_user_stats").upsert({
    user_id: userId,
    xp: newXP,
    level,
    current_daily_streak: currentStreak,
    longest_daily_streak: longestStreak,
    last_active_date: today,
    updated_at: new Date().toISOString(),
  });

  return { xp: newXP, level, currentStreak, longestStreak, leveledUp: level > levelForXP(prevXP).level };
}
