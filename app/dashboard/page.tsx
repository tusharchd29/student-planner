"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  scheduleDay,
  minutesToTime,
  timeToMinutes,
  FixedEvent,
  FlexTask,
  PersonalTask,
  ScheduledBlock,
} from "@/lib/scheduler";
import { TABLE_BY_TYPE, TaskKind } from "@/lib/tables";
import {
  todayISOInTZ,
  dayOfWeekInTZ,
  weekStartISOInTZ,
  DEFAULT_TIMEZONE,
} from "@/lib/timezone";

const typeStyles: Record<ScheduledBlock["type"], string> = {
  fixed: "bg-fixed/10 border-fixed text-fixed",
  flex: "bg-flex/10 border-flex text-flex",
  personal: "bg-personal/10 border-personal text-personal",
};

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type RawRow = { id: string; google_event_id: string | null; [k: string]: any };


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
        {blocks.map((b) => {
          const row = rawRowFor(b);
          return (
            <li
              key={`${b.sourceId}-${b.start}`}
              className={`rounded-xl border-l-4 p-3 ${typeStyles[b.type]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs opacity-70">
                    {b.start} – {b.end}
                  </div>
                  <div className="font-medium text-slate-800">{b.title}</div>
                  {b.type === "personal" && row && (
                    <div className="mt-1 text-xs text-slate-500">
                      {Math.min(
                        row.week_start === weekStartISOInTZ(tz)
                          ? row.minutes_logged
                          : 0,
                        row.weekly_quota_minutes ?? 0
                      )}
                      /{row.weekly_quota_minutes ?? 0} min this week
                      {row.current_streak > 0 && (
                        <span className="ml-2 text-orange-600">
                          🔥 {row.current_streak}wk
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {b.type !== "fixed" && (
                    <button
                      onClick={() =>
                        b.type === "personal"
                          ? logPersonalTime(b)
                          : markDone(b)
                      }
                      title={b.type === "personal" ? "Log time" : "Mark done"}
                      className="rounded-full border px-2 py-1 text-xs text-slate-600 hover:bg-white"
                    >
                      {b.type === "personal" ? "Log" : "Done"}
                    </button>
                  )}
                  <button
                    onClick={() => row && setEditing({ type: b.type, row })}
                    title="Edit"
                    className="rounded-full border px-2 py-1 text-xs text-slate-600 hover:bg-white"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteBlock(b)}
                    title="Delete"
                    className="rounded-full border px-2 py-1 text-xs text-red-500 hover:bg-white"
                  >
                    Del
                  </button>
                </div>
              </div>
            </li>
          );
        })}
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
    </main>
  );
}

type DraftTask = {
  type: TaskKind;
  title: string;
  duration_minutes: number;
  deadline: string; // flex only
  start_minutes: number; // fixed only
  end_minutes: number; // fixed only
  recurrence: "weekly" | "once"; // fixed only
  day_of_week: number; // fixed only, when recurrence === "weekly"
  event_date: string; // fixed only, when recurrence === "once"
  weekly_quota_minutes: number; // personal only
};

function defaultDraft(tz: string): DraftTask {
  return {
    type: "flex",
    title: "",
    duration_minutes: 60,
    deadline: todayISOInTZ(tz),
    start_minutes: 9 * 60,
    end_minutes: 10 * 60,
    recurrence: "weekly",
    day_of_week: dayOfWeekInTZ(tz),
    event_date: todayISOInTZ(tz),
    weekly_quota_minutes: 60,
  };
}

function draftFromRow(tz: string, type: TaskKind, row: RawRow): DraftTask {
  const base = defaultDraft(tz);
  if (type === "fixed") {
    return {
      ...base,
      type,
      title: row.title,
      start_minutes: row.start_minutes,
      end_minutes: row.end_minutes,
      recurrence: row.event_date ? "once" : "weekly",
      day_of_week: row.day_of_week ?? base.day_of_week,
      event_date: row.event_date ?? base.event_date,
    };
  }
  if (type === "flex") {
    return {
      ...base,
      type,
      title: row.title,
      duration_minutes: row.duration_minutes,
      deadline: row.deadline,
    };
  }
  return {
    ...base,
    type,
    title: row.title,
    duration_minutes: row.duration_minutes ?? 60,
    weekly_quota_minutes: row.weekly_quota_minutes ?? 60,
  };
}

async function insertOrUpdateTask(
  userId: string,
  draft: DraftTask,
  editingRowId?: string
) {
  const table = TABLE_BY_TYPE[draft.type];

  let payload: Record<string, any>;
  if (draft.type === "fixed") {
    payload = {
      user_id: userId,
      title: draft.title,
      start_minutes: draft.start_minutes,
      end_minutes: draft.end_minutes,
      day_of_week: draft.recurrence === "weekly" ? draft.day_of_week : null,
      event_date: draft.recurrence === "once" ? draft.event_date : null,
    };
  } else if (draft.type === "flex") {
    payload = {
      user_id: userId,
      title: draft.title,
      duration_minutes: draft.duration_minutes,
      deadline: draft.deadline,
    };
  } else {
    payload = {
      user_id: userId,
      title: draft.title,
      duration_minutes: draft.duration_minutes,
      weekly_quota_minutes: draft.weekly_quota_minutes,
    };
  }

  if (editingRowId) {
    delete payload.user_id; // never change ownership on update
    return supabase.from(table).update(payload).eq("id", editingRowId);
  }
  return supabase.from(table).insert(payload);
}

function AddTaskSheet({
  onClose,
  onSaved,
  editingType,
  editingRow,
  tz,
}: {
  onClose: () => void;
  onSaved: (message?: string) => void;
  editingType?: TaskKind;
  editingRow?: RawRow;
  tz: string;
}) {
  const isEditing = !!editingType && !!editingRow;
  const [stage, setStage] = useState<"input" | "review">(
    isEditing ? "review" : "input"
  );
  const [quickText, setQuickText] = useState("");
  const [draft, setDraft] = useState<DraftTask>(
    isEditing ? draftFromRow(tz, editingType!, editingRow!) : defaultDraft(tz)
  );
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    setParsing(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText }),
      });
      const parsed = await res.json();
      if (!res.ok) {
        setError(parsed.error ?? "Couldn't parse that task.");
        setParsing(false);
        return;
      }
      const base = defaultDraft(tz);
      setDraft({
        ...base,
        type: parsed.type ?? "flex",
        title: parsed.title ?? quickText,
        duration_minutes: parsed.duration_minutes ?? 60,
        deadline: parsed.deadline ?? base.deadline,
        start_minutes: parsed.start_minutes ?? base.start_minutes,
        end_minutes: parsed.end_minutes ?? base.end_minutes,
        recurrence: parsed.event_date ? "once" : "weekly",
        day_of_week: parsed.day_of_week ?? base.day_of_week,
        event_date: parsed.event_date ?? base.event_date,
        weekly_quota_minutes: parsed.weekly_quota_minutes ?? 60,
      });
      setStage("review");
    } catch {
      setError("Network error while parsing task.");
    }
    setParsing(false);
  }

  function skipToManualEntry() {
    setDraft((d) => ({ ...d, title: quickText || d.title }));
    setStage("review");
  }

  async function save() {
    setSaving(true);
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Not signed in — please log in again.");
      setSaving(false);
      return;
    }
    const { error: dbError } = await insertOrUpdateTask(
      user.id,
      draft,
      editingRow?.id
    );
    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }

    // Build an explicit confirmation of what actually got saved and when —
    // silently closing the sheet after a save made it impossible to tell
    // "saved but scheduled for a day you're not viewing" apart from
    // "didn't save at all".
    let when = "";
    if (draft.type === "flex") {
      when = `due ${draft.deadline}`;
    } else if (draft.type === "fixed") {
      when =
        draft.recurrence === "weekly"
          ? `every ${WEEKDAY_LABELS[draft.day_of_week]}`
          : `on ${draft.event_date}`;
    } else {
      when = `${draft.weekly_quota_minutes} min/week`;
    }
    onSaved(
      `${isEditing ? "Updated" : "Added"} "${draft.title}" (${draft.type}, ${when}).`
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-end bg-black/30">
      <div className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl bg-white p-6">
        {stage === "input" ? (
          <>
            <h2 className="mb-4 text-lg font-semibold">Add task</h2>
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder='Try: "history essay due Friday, ~2 hours"'
              rows={3}
              className="mb-2 w-full rounded-lg border p-2"
              autoFocus
            />
            <p className="mb-4 text-xs text-slate-400">
              Describe the task naturally, or skip straight to the form below.
            </p>
            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border py-2 text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={skipToManualEntry}
                className="flex-1 rounded-lg border py-2 text-slate-600"
              >
                Fill in manually
              </button>
              <button
                onClick={parse}
                disabled={parsing || !quickText.trim()}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
              >
                {parsing ? "Parsing…" : "Parse"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="mb-4 text-lg font-semibold">
              {isEditing ? "Edit task" : "Review before saving"}
            </h2>

            {!isEditing && (
              <>
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Type
                </label>
                <div className="mb-3 flex gap-2">
                  {(["fixed", "flex", "personal"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setDraft((d) => ({ ...d, type: k }))}
                      className={`rounded-full px-3 py-1 text-sm ${
                        draft.type === k
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </>
            )}

            <label className="mb-1 block text-xs font-medium text-slate-500">
              Title
            </label>
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              className="mb-3 w-full rounded-lg border p-2"
            />

            {draft.type === "flex" && (
              <div className="mb-3 flex gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Due date
                  </label>
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, deadline: e.target.value }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={5}
                    step={5}
                    value={draft.duration_minutes}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        duration_minutes: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border p-2"
                  />
                </div>
              </div>
            )}

            {draft.type === "fixed" && (
              <>
                <div className="mb-3 flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Start time
                    </label>
                    <input
                      type="time"
                      value={minutesToTime(draft.start_minutes)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          start_minutes: timeToMinutes(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border p-2"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      End time
                    </label>
                    <input
                      type="time"
                      value={minutesToTime(draft.end_minutes)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          end_minutes: timeToMinutes(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border p-2"
                    />
                  </div>
                </div>

                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Repeats
                </label>
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() =>
                      setDraft((d) => ({ ...d, recurrence: "weekly" }))
                    }
                    className={`rounded-full px-3 py-1 text-sm ${
                      draft.recurrence === "weekly"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Every week
                  </button>
                  <button
                    onClick={() =>
                      setDraft((d) => ({ ...d, recurrence: "once" }))
                    }
                    className={`rounded-full px-3 py-1 text-sm ${
                      draft.recurrence === "once"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    Just once
                  </button>
                </div>

                {draft.recurrence === "weekly" ? (
                  <div className="mb-3 flex gap-1">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={label}
                        onClick={() =>
                          setDraft((d) => ({ ...d, day_of_week: i }))
                        }
                        className={`flex-1 rounded-lg py-1 text-xs ${
                          draft.day_of_week === i
                            ? "bg-indigo-600 text-white"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-3">
                    <label className="mb-1 block text-xs font-medium text-slate-500">
                      Date
                    </label>
                    <input
                      type="date"
                      value={draft.event_date}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, event_date: e.target.value }))
                      }
                      className="w-full rounded-lg border p-2"
                    />
                  </div>
                )}
              </>
            )}

            {draft.type === "personal" && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-500">
                  Weekly quota (min)
                </label>
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={draft.weekly_quota_minutes}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      weekly_quota_minutes: Number(e.target.value),
                    }))
                  }
                  className="w-full rounded-lg border p-2"
                />
              </div>
            )}

            {error && (
              <p className="mb-3 text-sm text-red-600">
                Couldn&apos;t save: {error}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => (isEditing ? onClose() : setStage("input"))}
                className="flex-1 rounded-lg border py-2 text-slate-600"
              >
                {isEditing ? "Cancel" : "Back"}
              </button>
              <button
                onClick={save}
                disabled={saving || !draft.title.trim()}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : isEditing ? "Save changes" : "Add task"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
