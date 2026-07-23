export const TABLE_BY_TYPE = {
  fixed: "planner_fixed_events",
  flex: "planner_flex_tasks",
  personal: "planner_personal_tasks",
} as const;

export type TaskKind = keyof typeof TABLE_BY_TYPE;
