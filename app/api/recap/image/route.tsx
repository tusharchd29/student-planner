import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getUserTimezone } from "@/lib/userSettings";
import { todayISOInTZ, addDaysISOInTZ, weekStartISOInTZ } from "@/lib/timezone";

export const runtime = "edge";

// Warm palette matching the app's "organic" design system, punched up a
// notch for a card that's meant to be screenshotted/shared — bigger
// numbers, higher contrast, but the same terracotta/sage/cream identity.
const BG = "#f5ead8";
const SURFACE = "#ebddc5";
const TEXT = "#201e1d";
const ACCENT = "#c67139";
const ACCENT_2 = "#7a8a5e";

export async function GET(request: NextRequest) {
  const period = request.nextUrl.searchParams.get("period") === "week" ? "week" : "day";

  const supabase = createRouteHandlerClient(
    { cookies },
    { options: { db: { schema: "planner" } } }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return new Response("Not signed in", { status: 401 });
  }

  const tz = await getUserTimezone(supabase, user.id);
  const today = todayISOInTZ(tz);

  const { data: stats } = await supabase
    .from("planner_user_stats")
    .select("xp, level, current_daily_streak")
    .eq("user_id", user.id)
    .maybeSingle();

  let tasksDone = 0;
  let minutesFocused = 0;
  let label = "Today";

  if (period === "day") {
    const { data: completed } = await supabase
      .from("planner_flex_tasks")
      .select("duration_minutes")
      .eq("done", true)
      .gte("completed_at", `${today}T00:00:00Z`);
    tasksDone = completed?.length ?? 0;
    minutesFocused = (completed ?? []).reduce(
      (sum, r: any) => sum + (r.duration_minutes ?? 0),
      0
    );
  } else {
    const weekStart = weekStartISOInTZ(tz);
    const { data: completed } = await supabase
      .from("planner_flex_tasks")
      .select("duration_minutes")
      .eq("done", true)
      .gte("completed_at", `${weekStart}T00:00:00Z`);
    tasksDone = completed?.length ?? 0;
    minutesFocused = (completed ?? []).reduce(
      (sum, r: any) => sum + (r.duration_minutes ?? 0),
      0
    );
    label = "This week";
  }

  const hours = Math.floor(minutesFocused / 60);
  const mins = minutesFocused % 60;
  const timeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  const streak = stats?.current_daily_streak ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: "64px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 28, color: ACCENT, fontWeight: 700 }}>
            Student Planner
          </div>
          <div style={{ fontSize: 22, color: TEXT, opacity: 0.6, marginTop: 4 }}>
            {label}&apos;s recap
          </div>
        </div>

        <div style={{ display: "flex", gap: 32 }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: SURFACE,
              borderRadius: 32,
              padding: "32px 40px",
              flex: 1,
            }}
          >
            <div style={{ fontSize: 80, fontWeight: 700, color: TEXT }}>
              {tasksDone}
            </div>
            <div style={{ fontSize: 24, color: TEXT, opacity: 0.7 }}>
              task{tasksDone === 1 ? "" : "s"} crushed
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: SURFACE,
              borderRadius: 32,
              padding: "32px 40px",
              flex: 1,
            }}
          >
            <div style={{ fontSize: 80, fontWeight: 700, color: ACCENT_2 }}>
              {timeLabel}
            </div>
            <div style={{ fontSize: 24, color: TEXT, opacity: 0.7 }}>
              focused
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: ACCENT,
            borderRadius: 999,
            padding: "20px 36px",
            alignSelf: "flex-start",
          }}
        >
          <div style={{ fontSize: 36 }}>🔥</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: BG }}>
            {streak}-day streak
          </div>
        </div>
      </div>
    ),
    {
      width: 1080,
      height: 1080,
    }
  );
}
