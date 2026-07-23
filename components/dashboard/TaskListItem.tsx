"use client";

import type { ScheduledBlock } from "@/lib/scheduler";
import { weekStartISOInTZ } from "@/lib/timezone";
import type { RawRow } from "@/lib/types";

const typeStyles: Record<ScheduledBlock["type"], string> = {
  fixed: "bg-fixed/10 border-fixed text-fixed",
  flex: "bg-flex/10 border-flex text-flex",
  personal: "bg-personal/10 border-personal text-personal",
};

export function TaskListItem({
  block,
  row,
  tz,
  onMarkDone,
  onLogTime,
  onEdit,
  onDelete,
}: {
  block: ScheduledBlock;
  row: RawRow | undefined;
  tz: string;
  onMarkDone: (block: ScheduledBlock) => void;
  onLogTime: (block: ScheduledBlock) => void;
  onEdit: (block: ScheduledBlock, row: RawRow) => void;
  onDelete: (block: ScheduledBlock) => void;
}) {
  return (
    <li className={`rounded-xl border-l-4 p-3 ${typeStyles[block.type]}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-xs opacity-70">
            {block.start} – {block.end}
          </div>
          <div className="font-medium text-slate-800">{block.title}</div>
          {block.type === "personal" && row && (
            <div className="mt-1 text-xs text-slate-500">
              {Math.min(
                row.week_start === weekStartISOInTZ(tz) ? row.minutes_logged : 0,
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
          {block.type !== "fixed" && (
            <button
              onClick={() =>
                block.type === "personal" ? onLogTime(block) : onMarkDone(block)
              }
              title={block.type === "personal" ? "Log time" : "Mark done"}
              className="rounded-full border px-2 py-1 text-xs text-slate-600 hover:bg-white"
            >
              {block.type === "personal" ? "Log" : "Done"}
            </button>
          )}
          <button
            onClick={() => row && onEdit(block, row)}
            title="Edit"
            className="rounded-full border px-2 py-1 text-xs text-slate-600 hover:bg-white"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(block)}
            title="Delete"
            className="rounded-full border px-2 py-1 text-xs text-red-500 hover:bg-white"
          >
            Del
          </button>
        </div>
      </div>
    </li>
  );
}
