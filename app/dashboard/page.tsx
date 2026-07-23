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

  useEffect(() => {
    load();
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

  async function syncToCalendar() {
    setSyncing(true);
    await fetch("/api/calendar/sync", { method: "POST" });
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

function AddTaskSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"fixed" | "flex" | "personal">("flex");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    let insertError = null;
    if (kind === "fixed") {
      const { error } = await supabase.from("planner_fixed_events").insert({
        user_id: user.id,
        title,
        start_minutes: 9 * 60,
        end_minutes: 10 * 60,
      });
      insertError = error;
    } else if (kind === "flex") {
      const { error } = await supabase.from("planner_flex_tasks").insert({
        user_id: user.id,
        title,
        duration_minutes: 60,
        deadline: new Date().toISOString().slice(0, 10),
      });
      insertError = error;
    } else {
      const { error } = await supabase.from("planner_personal_tasks").insert({
        user_id: user.id,
        title,
        duration_minutes: 60,
        weekly_quota_minutes: 60,
      });
      insertError = error;
    }

    setSaving(false);

    if (insertError) {
      console.error(insertError);
      setError(insertError.message);
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-end bg-black/30">
      <div className="w-full rounded-t-2xl bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold">Add task</h2>
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
            onClick={save}
            disabled={saving || !title}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
