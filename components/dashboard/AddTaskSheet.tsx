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

function SegOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="seg-opt"
    >
      {children}
    </button>
  );
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
    <div className="organic sheet-backdrop">
      <div className="sheet">
        {stage === "input" ? (
          <>
            <h4 className="mb-[13.2px]">Add task</h4>
            <textarea
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              placeholder='Try: "history essay due Friday, ~2 hours"'
              rows={3}
              className="input mb-[8.8px]"
              autoFocus
            />
            <p className="text-muted mb-[13.2px] text-[12px]">
              Describe the task naturally, or skip straight to the form below.
            </p>
            {error && (
              <p className="banner banner-error mb-[13.2px]">{error}</p>
            )}
            <div className="flex gap-[8.8px]">
              <button onClick={onClose} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button
                onClick={skipToManualEntry}
                className="btn btn-secondary flex-1"
              >
                Fill in manually
              </button>
              <button
                onClick={parse}
                disabled={parsing || !quickText.trim()}
                className="btn btn-primary flex-1"
              >
                {parsing ? "Parsing…" : "Parse"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h4 className="mb-[13.2px]">
              {isEditing ? "Edit task" : "Review before saving"}
            </h4>

            {!isEditing && (
              <>
                <label className="field-label">Type</label>
                <div className="mb-[13.2px] flex gap-[8px]">
                  {(["fixed", "flex", "personal"] as const).map((k) => (
                    <SegOption
                      key={k}
                      active={draft.type === k}
                      onClick={() => setDraft((d) => ({ ...d, type: k }))}
                    >
                      {k}
                    </SegOption>
                  ))}
                </div>
              </>
            )}

            <label className="field-label">Title</label>
            <input
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
              className="input mb-[13.2px]"
            />

            {draft.type === "flex" && (
              <div className="mb-[13.2px] flex gap-[13.2px]">
                <div className="flex-1">
                  <label className="field-label">Due date</label>
                  <input
                    type="date"
                    value={draft.deadline}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, deadline: e.target.value }))
                    }
                    className="input"
                  />
                </div>
                <div className="flex-1">
                  <label className="field-label">Duration (min)</label>
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
                    className="input"
                  />
                </div>
              </div>
            )}

            {draft.type === "fixed" && (
              <>
                <div className="mb-[13.2px] flex gap-[13.2px]">
                  <div className="flex-1">
                    <label className="field-label">Start time</label>
                    <input
                      type="time"
                      value={minutesToTime(draft.start_minutes)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          start_minutes: timeToMinutes(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="field-label">End time</label>
                    <input
                      type="time"
                      value={minutesToTime(draft.end_minutes)}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          end_minutes: timeToMinutes(e.target.value),
                        }))
                      }
                      className="input"
                    />
                  </div>
                </div>

                <label className="field-label">Repeats</label>
                <div className="mb-[13.2px] flex gap-[8px]">
                  <SegOption
                    active={draft.recurrence === "weekly"}
                    onClick={() =>
                      setDraft((d) => ({ ...d, recurrence: "weekly" }))
                    }
                  >
                    Every week
                  </SegOption>
                  <SegOption
                    active={draft.recurrence === "once"}
                    onClick={() =>
                      setDraft((d) => ({ ...d, recurrence: "once" }))
                    }
                  >
                    Just once
                  </SegOption>
                </div>

                {draft.recurrence === "weekly" ? (
                  <div className="mb-[13.2px] flex gap-[4px]">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({ ...d, day_of_week: i }))
                        }
                        data-active={draft.day_of_week === i}
                        className="seg-opt flex-1 text-center"
                        style={{ padding: "6px 0" }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mb-[13.2px]">
                    <label className="field-label">Date</label>
                    <input
                      type="date"
                      value={draft.event_date}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, event_date: e.target.value }))
                      }
                      className="input"
                    />
                  </div>
                )}
              </>
            )}

            {draft.type === "personal" && (
              <div className="mb-[13.2px]">
                <label className="field-label">Weekly quota (min)</label>
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
                  className="input"
                />
              </div>
            )}

            {error && (
              <p className="banner banner-error mb-[13.2px]">
                Couldn&apos;t save: {error}
              </p>
            )}

            <div className="flex gap-[8.8px]">
              <button
                onClick={() => (isEditing ? onClose() : setStage("input"))}
                className="btn btn-secondary flex-1"
              >
                {isEditing ? "Cancel" : "Back"}
              </button>
              <button
                onClick={save}
                disabled={saving || !draft.title.trim()}
                className="btn btn-primary flex-1"
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
