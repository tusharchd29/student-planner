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

const typeStyles: Record<ScheduledBlock["type"], string> = {
  fixed: "bg-fixed/10 border-fixed text-fixed",
  flex: "bg-flex/10 border-flex text-flex",
  personal: "bg-personal/10 border-personal text-personal",
};

export default function DashboardPage() {
  const [blocks, setBlocks] = useState<ScheduledBlock[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reslotMessage, setReslotMessage] = useState<string | null>(null);

  useEffect(() => {
    load();
    checkMissedTasks();
  }, []);

  async function load() {
    const [{ data: fixedRows }, { data: flexRows }, { data: personalRows }] =
      await Promise.all([
        supabase.from("planner_fixed_events").select("*"),
        supabase.from("planner_flex_tasks").select("*"),
        supabase.from("planner_personal_tasks").select("*"),
      ]);

    const fixed: FixedEvent[] = (fixedRows ?? []).map((r: any) => ({
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
      weeklyQuotaMinutes: r.weekly_quota_minutes,
    }));

    setBlocks(scheduleDay(fixed, flex, personal));
  }

  async function checkMissedTasks() {
    try {
      const res = await fetch("/api/tasks/reslot-missed", { method: "POST" });
      const data = await res.json();
      if (res.ok && data.reslotted > 0) {
        setReslotMessage(data.summary ?? `Re-slotted ${data.reslotted} missed task(s).`);
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
      }
    } catch (e) {
      setSyncMessage("Network error while syncing.");
    }
    setSyncing(false);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <button
          onClick={syncToCalendar}
          disabled={syncing}
          className="rounded-full border border-indigo-600 px-4 py-1 text-sm text-indigo-600 disabled:opacity-50"
        >
          {syncing ? "Syncing…" : "Sync to Google Calendar"}
        </button>
      </div>
      {reslotMessage && (
        <p className="mb-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-700">
          {reslotMessage}
        </p>
      )}
      {syncMessage && (
        <p className="mb-4 text-sm text-slate-600">{syncMessage}</p>
      )}

      <ol className="space-y-3">
        {blocks.map((b) => (
          <li
            key={b.id}
            className={`rounded-xl border-l-4 p-3 ${typeStyles[b.type]}`}
          >
            <div className="text-xs opacity-70">
              {b.start} – {b.end}
            </div>
            <div className="font-medium text-slate-800">{b.title}</div>
          </li>
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

      {showAdd && <AddTaskSheet onClose={() => setShowAdd(false)} onSaved={load} />}
    </main>
  );
}

type TaskKind = "fixed" | "flex" | "personal";

type DraftTask = {
  type: TaskKind;
  title: string;
  duration_minutes: number;
  deadline: string; // YYYY-MM-DD, flex only
  start_minutes: number; // fixed only
  end_minutes: number; // fixed only
  weekly_quota_minutes: number; // personal only
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function insertTask(userId: string, draft: DraftTask) {
  if (draft.type === "fixed") {
    return supabase.from("planner_fixed_events").insert({
      user_id: userId,
      title: draft.title,
      start_minutes: draft.start_minutes,
      end_minutes: draft.end_minutes,
    });
  }
  if (draft.type === "flex") {
    return supabase.from("planner_flex_tasks").insert({
      user_id: userId,
      title: draft.title,
      duration_minutes: draft.duration_minutes,
      deadline: draft.deadline,
    });
  }
  return supabase.from("planner_personal_tasks").insert({
    user_id: userId,
    title: draft.title,
    duration_minutes: draft.duration_minutes,
    weekly_quota_minutes: draft.weekly_quota_minutes,
  });
}

function AddTaskSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<"input" | "review">("input");
  const [quickText, setQuickText] = useState("");
  const [draft, setDraft] = useState<DraftTask>({
    type: "flex",
    title: "",
    duration_minutes: 60,
    deadline: todayISO(),
    start_minutes: 9 * 60,
    end_minutes: 10 * 60,
    weekly_quota_minutes: 60,
  });
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
      setDraft({
        type: parsed.type ?? "flex",
        title: parsed.title ?? quickText,
        duration_minutes: parsed.duration_minutes ?? 60,
        deadline: parsed.deadline ?? todayISO(),
        start_minutes: parsed.start_minutes ?? 9 * 60,
        end_minutes: parsed.end_minutes ?? 10 * 60,
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
    const { error: insertError } = await insertTask(user.id, draft);
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-end bg-black/30">
      <div className="w-full rounded-t-2xl bg-white p-6">
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
            {error && (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            )}
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
              Review before saving
            </h2>

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
                onClick={() => setStage("input")}
                className="flex-1 rounded-lg border py-2 text-slate-600"
              >
                Back
              </button>
              <button
                onClick={save}
                disabled={saving || !draft.title.trim()}
                className="flex-1 rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : "Add task"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
