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

// Shared insert logic used by both the manual form and the Groq-parsed
// quick-add flow, so both paths hit the same columns/RLS behavior.
async function insertTask(
  userId: string,
  kind: "fixed" | "flex" | "personal",
  fields: {
    title: string;
    start_minutes?: number;
    end_minutes?: number;
    duration_minutes?: number;
    deadline?: string;
    weekly_quota_minutes?: number;
  }
) {
  if (kind === "fixed") {
    return supabase.from("planner_fixed_events").insert({
      user_id: userId,
      title: fields.title,
      start_minutes: fields.start_minutes ?? 9 * 60,
      end_minutes: fields.end_minutes ?? 10 * 60,
    });
  }
  if (kind === "flex") {
    return supabase.from("planner_flex_tasks").insert({
      user_id: userId,
      title: fields.title,
      duration_minutes: fields.duration_minutes ?? 60,
      deadline: fields.deadline ?? new Date().toISOString().slice(0, 10),
    });
  }
  return supabase.from("planner_personal_tasks").insert({
    user_id: userId,
    title: fields.title,
    duration_minutes: fields.duration_minutes ?? 60,
    weekly_quota_minutes: fields.weekly_quota_minutes ?? 60,
  });
}

function AddTaskSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"manual" | "quick">("quick");

  // Manual mode state
  const [kind, setKind] = useState<"fixed" | "flex" | "personal">("flex");
  const [title, setTitle] = useState("");

  // Quick-add mode state
  const [quickText, setQuickText] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveManual() {
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
    const { error: insertError } = await insertTask(user.id, kind, { title });
    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    onSaved();
    onClose();
  }

  async function saveQuick() {
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

    try {
      const res = await fetch("/api/tasks/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: quickText }),
      });
      const parsed = await res.json();
      if (!res.ok) {
        setError(parsed.error ?? "Couldn't parse that task.");
        setSaving(false);
        return;
      }

      const { error: insertError } = await insertTask(user.id, parsed.type, {
        title: parsed.title,
        duration_minutes: parsed.duration_minutes ?? undefined,
        deadline: parsed.deadline ?? undefined,
        start_minutes: parsed.start_minutes ?? undefined,
        end_minutes: parsed.end_minutes ?? undefined,
        weekly_quota_minutes: parsed.weekly_quota_minutes ?? undefined,
      });

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch (e) {
      setError("Network error while parsing task.");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 flex items-end bg-black/30">
      <div className="w-full rounded-t-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Add task</h2>
          <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs">
            <button
              onClick={() => setMode("quick")}
              className={`rounded-full px-3 py-1 ${
                mode === "quick" ? "bg-white shadow" : "text-slate-500"
              }`}
            >
              Quick add
            </button>
            <button
              onClick={() => setMode("manual")}
              className={`rounded-full px-3 py-1 ${
                mode === "manual" ? "bg-white shadow" : "text-slate-500"
              }`}
            >
              Manual
            </button>
          </div>
        </div>

        {mode === "quick" ? (
          <>
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder='Try: "history essay due Friday, ~2 hours"'
              rows={3}
              className="mb-2 w-full rounded-lg border p-2"
            />
            <p className="mb-4 text-xs text-slate-400">
              Describe the task naturally — type, duration, and deadline are
              figured out automatically.
            </p>
          </>
        ) : (
          <>
            <div className="mb-4 flex gap-2">
              {(["fixed", "flex", "personal"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={`rounded-full px-3 py-1 text-sm ${
                    kind === k
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="mb-4 w-full rounded-lg border p-2"
            />
          </>
        )}

        {error && (
          <p className="mb-4 text-sm text-red-600">Couldn&apos;t save: {error}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border py-2 text-slate-600"
          >
            Cancel
          </button>
          <button
            onClick={mode === "quick" ? saveQuick : saveManual}
            disabled={
              saving || (mode === "quick" ? !quickText.trim() : !title.trim())
            }
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : mode === "quick" ? "Parse & Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
