export type ReminderInput = {
  type: "fixed" | "flex" | "personal";
  durationMinutes: number;
  // Days until deadline, only meaningful for "flex" (0 = due today,
  // negative = overdue, undefined = no deadline / not applicable).
  daysUntilDue?: number;
};

/**
 * Reminder lead times, scaled by task type and urgency rather than a flat
 * 10 minutes for everything:
 *
 * - fixed (a class/appointment): a single 10-min heads-up is genuinely all
 *   that's needed — you just need to know to walk over.
 * - flex (homework/assignments): longer or more urgent tasks get an earlier
 *   warning, AND a second closer-in reminder if the deadline is today or
 *   tomorrow, so an under-attention deadline doesn't just get one ignored
 *   ping.
 * - personal (protected time): a lighter single nudge — the whole point of
 *   this task type is that it's not high-pressure.
 */
export function computeReminders(
  input: ReminderInput
): { method: "popup"; minutes: number }[] {
  if (input.type === "fixed") {
    return [{ method: "popup", minutes: 10 }];
  }

  if (input.type === "personal") {
    return [{ method: "popup", minutes: 15 }];
  }

  // flex
  const { durationMinutes, daysUntilDue } = input;
  const overrides: { method: "popup"; minutes: number }[] = [];

  const urgent = daysUntilDue !== undefined && daysUntilDue <= 1;
  const longTask = durationMinutes >= 90;

  // Earlier lead time: longer tasks and more urgent ones get more warning.
  let earlyLead = 30;
  if (urgent) earlyLead = Math.max(earlyLead, 60);
  if (longTask) earlyLead = Math.max(earlyLead, durationMinutes);
  overrides.push({ method: "popup", minutes: earlyLead });

  // A closer-in "last call" reminder only when it's actually due soon —
  // otherwise one early warning is enough and we avoid notification noise.
  if (urgent) {
    overrides.push({ method: "popup", minutes: 10 });
  }

  return overrides;
}
