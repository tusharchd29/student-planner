"use client";

import type { ScheduledBlock } from "@/lib/scheduler";
import { weekStartISOInTZ } from "@/lib/timezone";
import type { RawRow } from "@/lib/types";

const blockClass: Record<ScheduledBlock["type"], string> = {
  fixed: "block-fixed",
  flex: "block-flex",
  personal: "block-personal",
};

const pillClass: Record<ScheduledBlock["type"], string> = {
  fixed: "pill-fixed",
  flex: "pill-flex",
  personal: "pill-personal",
};

const pillLabel: Record<ScheduledBlock["type"], string> = {
  fixed: "Class",
  flex: "Task",
  personal: "Personal",
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
    <li
      className={`card elev-sm ${blockClass[block.type]}`}
      style={{ padding: "13.2px" }}
    >
      <div className="flex items-start justify-between gap-[8.8px]">
        <div className="min-w-0 flex-1">
          <div className="mb-[2px] flex items-center gap-[8px]">
            <span className="text-[12px]" style={{ opacity: 0.6 }}>
              {block.start} – {block.end}
            </span>
            <span className={`tag ${pillClass[block.type]}`}>
              {pillLabel[block.type]}
            </span>
          </div>
          <div className="text-[15px] font-semibold">{block.title}</div>
          {block.type === "personal" && row && (
            <div className="mt-[4px] text-[12px]" style={{ opacity: 0.65 }}>
              {Math.min(
                row.week_start === weekStartISOInTZ(tz) ? row.minutes_logged : 0,
                row.weekly_quota_minutes ?? 0
              )}
              /{row.weekly_quota_minutes ?? 0} min this week
              {row.current_streak > 0 && (
                <span
                  className="ml-[8px]"
                  style={{ color: "var(--color-accent-700)" }}
                >
                  🔥 {row.current_streak}wk
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          {block.type !== "fixed" && (
            <button
              onClick={() =>
                block.type === "personal" ? onLogTime(block) : onMarkDone(block)
              }
              title={block.type === "personal" ? "Log time" : "Mark done"}
              className="btn btn-secondary"
              style={{ padding: "4px 10px", fontSize: "12px" }}
            >
              {block.type === "personal" ? "Log" : "Done"}
            </button>
          )}
          <button
            onClick={() => row && onEdit(block, row)}
            title="Edit"
            className="btn btn-secondary"
            style={{ padding: "4px 10px", fontSize: "12px" }}
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(block)}
            title="Delete"
            className="btn btn-danger"
            style={{ padding: "4px 10px", fontSize: "12px" }}
          >
            Del
          </button>
        </div>
      </div>
    </li>
  );
}
