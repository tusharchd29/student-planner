"use client";

import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import { supabase } from "@/lib/supabaseClient";
import {
  scheduleDay,
  minutesToTime,
  FixedEvent,
  FlexTask,
  PersonalTask,
  ScheduledBlock,
} from "@/lib/scheduler";
import { TABLE_BY_TYPE } from "@/lib/tables";
import {
  todayISOInTZ,
  dayOfWeekInTZ,
  weekStartISOInTZ,
  DEFAULT_TIMEZONE,
} from "@/lib/timezone";
import type { RawRow } from "@/lib/types";
import { recordCompletion, xpForDuration, levelForXP } from "@/lib/gamify";
import { AddTaskSheet } from "@/components/dashboard/AddTaskSheet";
import { AccountSheet } from "@/components/dashboard/AccountSheet";
import { TaskListItem } from "@/components/dashboard/TaskListItem";

function RefreshCwIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8a9 9 0 0 0-15-6.7L3 4" />
      <path d="M3 4v5h5" />
      <path d="M3 16a9 9 0 0 0 15 6.7l3-2.7" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
      <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
    </svg>
  );
}

function burstConfetti() {
  confetti({
    particleCount: 60,
    spread: 65,
    origin: { y: 0.7 },
    colors: ["#c67139", "#7a8a5e", "#f5ead8"],
    disableForReducedMotion: true,
  });
}

export default function DashboardPage() {
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [tz, setTz] = useState(DEFAULT_TIMEZONE);
  const [rawRows, setRawRows] = useState<{
    fixed: RawRow[];
    flex: RawRow[];
    personal: RawRow[];
  }>({ fixed: [], flex: [], personal: [] });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<{
    type: keyof typeof TABLE_BY_TYPE;
    row: RawRow;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reslotMessage, setReslotMessage] = useState<string | null>(null);
  const [streakMessage, setStreakMessage] = useState<string | null>(null);
  const [addedMessage, setAddedMessage] = useState<string | null>(null);
  const [report, setReport] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [showAccount, setShowAccount] = useState(false);

  // Daily recap — auto-fetched (cached) on load, plus a manual button.
  const [dailyRecap, setDailyRecap] = useState<string | null>(null);
  const [dailyRecapLoading, setDailyRecapLoading] = useState(false);
  const [dailyRecapError, setDailyRecapError] = useState<string | null>(null);

  // Gamification — XP/level/streak, kept in local state so the header
  // updates instantly on completion instead of waiting on a refetch.
  const [xp, setXp] = useState(0);
  const [levelTitle, setLevelTitle] = useState("Getting Started");
  const [dailyStreak, setDailyStreak] = useState(0);
  const [levelUpToast, setLevelUpToast] = useState<string | null>(null);

  async function fetchWeeklyReport(force = false) {
    setReportLoading(true);
    setReportError(null);
    try {
      const res = await fetch("/api/reports/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReportError(data.error ?? "Couldn't generate the report.");
      } else {
        setReport(data.report);
      }
    } catch {
      setReportError("Network error while generating the report.");
    }
    setReportLoading(false);
  }

  async function fetchDailyRecap(force = false) {
    setDailyRecapLoading(true);
    setDailyRecapError(null);
    try {
      const res = await fetch("/api/reports/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDailyRecapError(data.error ?? "Couldn't generate today's recap.");
      } else {
        setDailyRecap(data.report);
      }
    } catch {
      setDailyRecapError("Network error while generating the recap.");
    }
    setDailyRecapLoading(false);
  }

  async function loadStats() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("planner_user_stats")
      .select("xp, level, current_daily_streak")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data) {
      setXp(data.xp);
      setLevelTitle(levelForXP(data.xp).title);
      setDailyStreak(data.current_daily_streak);
    }
  }

  async function handleSaved(message?: string) {
    if (message) setAddedMessage(message);
    load();
  }

  useEffect(() => {
    resolveTimezone().then((resolvedTz) => {
      load(resolvedTz);
    });
    checkMissedTasks();
    rollWeek();
    loadStats();
    // Auto-ready by the time you open the app — silently cached after the
    // first generation each day, so this is free on every load after that.
    fetchDailyRecap(false);
  }, []);

  async function resolveTimezone(): Promise<string> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return DEFAULT_TIMEZONE;

    const { data: existing } = await supabase
      .from("planner_user_settings")
      .select("timezone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.timezone) {
      setTz(existing.timezone);
      return existing.timezone;
    }

    const detected =
      Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
    await supabase
      .from("planner_user_settings")
      .upsert({ user_id: user.id, timezone: detected });
    setTz(detected);
    return detected;
  }

  async function load(tzOverride?: string) {
    const effectiveTz = tzOverride ?? tz;
    const [{ data: fixedRows }, { data: flexRows }, { data: personalRows }] =
      await Promise.all([
        supabase.from("planner_fixed_events").select("*"),
        supabase.from("planner_flex_tasks").select("*").eq("done", false),
        supabase.from("planner_personal_tasks").select("*").eq("done", false),
      ]);

    setRawRows({
      fixed: fixedRows ?? [],
      flex: flexRows ?? [],
      personal: personalRows ?? [],
    });

    const todayDow = dayOfWeekInTZ(effectiveTz);
    const today = todayISOInTZ(effectiveTz);
    const currentWeekStart = weekStartISOInTZ(effectiveTz);

    const todaysFixed = (fixedRows ?? []).filter(
      (r: any) =>
        r.event_date === today ||
        (r.event_date == null && r.day_of_week === todayDow) ||
        (r.event_date == null && r.day_of_week == null)
    );

    const fixed: FixedEvent[] = todaysFixed.map((r: any) => ({
      id: r.id,
      title: r.title,
      start: minutesToTime(r.start_minutes),
      end: minutesToTime(r.end_minutes),
    }));
    const flex: FlexTask[] = (flexRows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      estimatedMinutes: r.duration_minutes,
      dueDate: r.deadline,
    }));
    const personal: PersonalTask[] = (personalRows ?? []).map((r: any) => ({
      id: r.id,
      title: r.title,
      weeklyQuotaMinutes: r.weekly_quota_minutes ?? 0,
      minutesUsedThisWeek:
        r.week_start === currentWeekStart ? r.minutes_logged : 0,
    }));

    setBlocks(scheduleDay(fixed, flex, personal));
  }

  async function checkMissedTasks() {
    try {
      const res = await fetch("/api/tasks/reslot-missed", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.reslotted > 0) {
        setReslotMessage(
          data.summary ?? `Re-slotted ${data.reslotted} missed task(s).`
        );
        load();
      }
    } catch {
      // Non-critical — silently skip if this fails.
    }
  }

  async function rollWeek() {
    try {
      const res = await fetch("/api/tasks/roll-week", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.rolled > 0) {
        const parts = (data.changes as { title: string; streak: number; met: boolean }[]).map(
          (c) =>
            c.met
              ? `🔥 ${c.title}: ${c.streak}-week streak!`
              : `${c.title}: streak reset.`
        );
        setStreakMessage(parts.join(" "));
        load();
      }
    } catch {
      // Non-critical — silently skip if this fails.
    }
  }

  async function syncToCalendar() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/calendar/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncMessage(data.error ?? "Sync failed.");
      } else {
        setSyncMessage(
          `Synced ${data.synced} event${data.synced === 1 ? "" : "s"}${
            data.failed
              ? ` (${data.failed} failed${
                  data.firstError ? `: ${data.firstError}` : ""
                })`
              : ""
          }.`
        );
        load();
      }
    } catch (e) {
      setSyncMessage("Network error while syncing.");
    }
    setSyncing(false);
  }

  function rawRowFor(block: ScheduledBlock): RawRow | undefined {
    return rawRows[block.type].find((r) => r.id === block.sourceId);
  }

  async function awardXP(minutes: number) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const result = await recordCompletion(supabase, user.id, tz, xpForDuration(minutes));
    setXp(result.xp);
    setDailyStreak(result.currentStreak);
    const { title } = levelForXP(result.xp);
    setLevelTitle(title);
    burstConfetti();
    if (result.leveledUp) {
      setLevelUpToast(`Level up — you're ${title} now 🎉`);
      setTimeout(() => setLevelUpToast(null), 4000);
    }
  }

  async function markDone(block: ScheduledBlock) {
    if (block.type === "fixed") return; // fixed events have no "done" concept
    const table = TABLE_BY_TYPE[block.type];
    const update: Record<string, any> = { done: true };
    if (block.type === "flex") update.completed_at = new Date().toISOString();
    await supabase.from(table).update(update).eq("id", block.sourceId);
    if (block.type === "flex") {
      const row = rawRowFor(block);
      awardXP(row?.duration_minutes ?? 30);
    }
    load();
  }

  async function logPersonalTime(block: ScheduledBlock) {
    const row = rawRowFor(block);
    if (!row) return;
    const currentWeekStart = weekStartISOInTZ(tz);
    const sameWeek = row.week_start === currentWeekStart;
    const newLogged = (sameWeek ? row.minutes_logged : 0) + (row.duration_minutes ?? 30);
    await supabase
      .from("planner_personal_tasks")
      .update({
        week_start: currentWeekStart,
        minutes_logged: Math.min(newLogged, row.weekly_quota_minutes ?? newLogged),
      })
      .eq("id", block.sourceId);
    awardXP(row.duration_minutes ?? 30);
    load();
  }

  async function deleteBlock(block: ScheduledBlock) {
    const row = rawRowFor(block);
    const table = TABLE_BY_TYPE[block.type];

    if (row?.google_event_id) {
      try {
        await fetch("/api/calendar/delete-event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ eventId: row.google_event_id }),
        });
      } catch {
        // Non-fatal — proceed with deleting the task row regardless.
      }
    }

    await supabase.from(table).delete().eq("id", block.sourceId);
    load();
  }

  return (
    <main className="organic mx-auto min-h-screen max-w-lg px-[17.6px] py-[26.4px] pb-[100px]">
      {levelUpToast && (
        <div
          className="fixed left-1/2 top-[17.6px] z-50 -translate-x-1/2 rounded-full px-[17.6px] py-[8.8px] text-[13px] font-semibold"
          style={{ background: "var(--color-accent)", color: "var(--color-bg)", boxShadow: "var(--shadow-lg)" }}
        >
          {levelUpToast}
        </div>
      )}

      <div className="mb-[13.2px] flex flex-wrap items-center justify-between gap-[8.8px]">
        <h2 className="m-0">Today</h2>
        <div className="flex flex-wrap gap-[6px]">
          <button
            onClick={() => setShowAccount(true)}
            className="btn btn-secondary"
            style={{ padding: "4px 12px", fontSize: "13px" }}
          >
            Account
          </button>
          <button
            onClick={() => fetchWeeklyReport(false)}
            disabled={reportLoading}
            className="btn btn-secondary"
            style={{ padding: "4px 12px", fontSize: "13px" }}
          >
            {reportLoading ? "Writing…" : "Weekly report"}
          </button>
          <button
            onClick={syncToCalendar}
            disabled={syncing}
            className="btn btn-primary"
            style={{ padding: "4px 14px", fontSize: "13px" }}
          >
            <RefreshCwIcon />
            {syncing ? "Syncing…" : "Sync to Google Calendar"}
          </button>
        </div>
      </div>

      {/* XP / level / streak strip */}
      <div className="card elev-sm mb-[13.2px] flex-row items-center justify-between" style={{ padding: "10px 14px" }}>
        <div>
          <div className="text-[13px] font-semibold">{levelTitle}</div>
          <div className="text-muted text-[11px]">{xp} XP</div>
        </div>
        <div className="flex items-center gap-[13.2px]">
          {dailyStreak > 0 && (
            <span className="tag tag-accent-2">🔥 {dailyStreak}-day streak</span>
          )}
          <a
            href="/api/recap/image?period=day"
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ padding: "4px 10px", fontSize: "12px" }}
            title="Get a shareable recap card"
          >
            <ShareIcon />
            Recap
          </a>
        </div>
      </div>

      {/* Daily recap — auto-populated, silent if not ready yet */}
      {dailyRecap && (
        <div className="card elev-sm mb-[13.2px]" style={{ padding: "13.2px" }}>
          <div className="mb-[4px] flex items-center justify-between">
            <span className="text-[11px] uppercase" style={{ letterSpacing: "0.06em", opacity: 0.55 }}>
              Today's recap
            </span>
            <button
              onClick={() => fetchDailyRecap(true)}
              disabled={dailyRecapLoading}
              className="btn-ghost text-[11px]"
              style={{ background: "none", padding: 0 }}
            >
              {dailyRecapLoading ? "…" : "Refresh"}
            </button>
          </div>
          <p className="m-0 text-[14px]" style={{ lineHeight: 1.5 }}>
            {dailyRecap}
          </p>
        </div>
      )}
      {dailyRecapError && (
        <p className="banner banner-error mb-[8.8px]">{dailyRecapError}</p>
      )}

      {reportError && (
        <p className="banner banner-error mb-[8.8px]">{reportError}</p>
      )}
      {report && (
        <div className="card elev-sm mb-[13.2px]" style={{ padding: "17.6px" }}>
          <div className="mb-[8.8px] flex items-center justify-between">
            <h5 className="m-0">Your week in review</h5>
            <div className="flex gap-[13.2px]">
              <button
                onClick={() => fetchWeeklyReport(true)}
                disabled={reportLoading}
                className="btn-ghost text-[12px]"
                style={{ background: "none", padding: 0 }}
              >
                Regenerate
              </button>
              <button
                onClick={() => setReport(null)}
                className="text-muted text-[12px]"
                style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                Close
              </button>
            </div>
          </div>
          <p className="m-0 text-[14px]" style={{ lineHeight: 1.6 }}>
            {report}
          </p>
        </div>
      )}
      {reslotMessage && (
        <p className="banner banner-warn mb-[8.8px]">{reslotMessage}</p>
      )}
      {streakMessage && (
        <p className="banner banner-warn mb-[8.8px]">{streakMessage}</p>
      )}
      {addedMessage && (
        <p className="banner banner-success mb-[8.8px]">{addedMessage}</p>
      )}
      {syncMessage && (
        <p className="text-muted mb-[13.2px] text-[13px]">{syncMessage}</p>
      )}

      <ol className="flex flex-col gap-[8.8px]" style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {blocks.map((b) => (
          <TaskListItem
            key={`${b.sourceId}-${b.start}`}
            block={b}
            row={rawRowFor(b)}
            tz={tz}
            onMarkDone={markDone}
            onLogTime={logPersonalTime}
            onEdit={(block, row) => setEditing({ type: block.type, row })}
            onDelete={deleteBlock}
          />
        ))}
        {blocks.length === 0 && (
          <p className="text-muted text-[14px]">
            Nothing on deck yet — add something 👀
          </p>
        )}
      </ol>

      <button
        onClick={() => setShowAdd(true)}
        aria-label="Add task"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full text-[28px]"
        style={{
          background: "var(--color-accent)",
          color: "var(--color-bg)",
          boxShadow: "var(--shadow-lg)",
          border: "none",
          cursor: "pointer",
          lineHeight: 1,
        }}
      >
        +
      </button>

      {showAdd && (
        <AddTaskSheet
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
          tz={tz}
        />
      )}
      {editing && (
        <AddTaskSheet
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          editingType={editing.type}
          editingRow={editing.row}
          tz={tz}
        />
      )}
      {showAccount && <AccountSheet onClose={() => setShowAccount(false)} />}
    </main>
  );
}
