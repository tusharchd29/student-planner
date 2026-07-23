"use client";

import { useEffect, useState } from "react";
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
import { AddTaskSheet } from "@/components/dashboard/AddTaskSheet";
import { AccountSheet } from "@/components/dashboard/AccountSheet";
import { TaskListItem } from "@/components/dashboard/TaskListItem";

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
  }, []);

  // Detects the browser's timezone and saves it as the user's preference if
  // they haven't set one yet (first login), or reads back whatever's
  // already stored. This replaces the previous hardcoded Asia/Kolkata,
  // which silently gave every non-Indian user wrong days.
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

    // Only fixed events actually happening today: a one-off event_date
    // match, a recurring day_of_week match, or legacy rows with neither
    // set (treated as every day).
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

  async function markDone(block: ScheduledBlock) {
    if (block.type === "fixed") return; // fixed events have no "done" concept
    const table = TABLE_BY_TYPE[block.type];
    const update: Record<string, any> = { done: true };
    if (block.type === "flex") update.completed_at = new Date().toISOString();
    await supabase.from(table).update(update).eq("id", block.sourceId);
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
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowAccount(true)}
            className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-500"
          >
            Account
          </button>
          <button
            onClick={() => fetchWeeklyReport(false)}
            disabled={reportLoading}
            className="rounded-full border border-slate-400 px-3 py-1 text-sm text-slate-600 disabled:opacity-50"
          >
            {reportLoading ? "Writing…" : "Weekly report"}
          </button>
          <button
            onClick={syncToCalendar}
            disabled={syncing}
            className="rounded-full border border-indigo-600 px-4 py-1 text-sm text-indigo-600 disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync to Google Calendar"}
          </button>
        </div>
      </div>
      {reportError && (
        <p className="mb-2 rounded-lg bg-red-50 p-2 text-sm text-red-600">
          {reportError}
        </p>
      )}
      {report && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Your week in review
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => fetchWeeklyReport(true)}
                disabled={reportLoading}
                className="text-xs text-indigo-600 disabled:opacity-50"
              >
                Regenerate
              </button>
              <button
                onClick={() => setReport(null)}
                className="text-xs text-slate-400"
              >
                Close
              </button>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-slate-700">{report}</p>
        </div>
      )}
      {reslotMessage && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
          {reslotMessage}
        </p>
      )}
      {streakMessage && (
        <p className="mb-2 rounded-lg bg-orange-50 p-2 text-sm text-orange-700">
          {streakMessage}
        </p>
      )}
      {addedMessage && (
        <p className="mb-2 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-700">
          {addedMessage}
        </p>
      )}
      {syncMessage && (
        <p className="mb-4 text-sm text-slate-600">{syncMessage}</p>
      )}

      <ol className="space-y-3">
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
          <p className="text-sm text-slate-400">
            Nothing scheduled yet — add a task to get started.
          </p>
        )}
      </ol>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full bg-indigo-600 text-2xl text-white shadow-lg"
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
