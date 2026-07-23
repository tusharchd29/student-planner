"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { minutesToTime, timeToMinutes } from "@/lib/scheduler";
import { TABLE_BY_TYPE, TaskKind } from "@/lib/tables";
import { todayISOInTZ, dayOfWeekInTZ } from "@/lib/timezone";
import type { RawRow } from "@/lib/types";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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

export function AddTaskSheet({
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
