import { NextRequest, NextResponse } from "next/server";
import { callGroqJSON, todayContext } from "@/lib/groq";

const SYSTEM_PROMPT = `You extract a single student task from a short free-text
description and return ONLY a JSON object (no markdown, no prose).

${todayContext()}

Schema:
{
  "type": "fixed" | "flex" | "personal",
  "title": string,           // short, cleaned-up task title
  "duration_minutes": number, // your best estimate if not stated (default 60)
  "deadline": "YYYY-MM-DD" | null,   // only for "flex" tasks; resolve relative
                                       // dates ("Friday", "tomorrow") to the
                                       // next real calendar date from today
  "start_minutes": number | null,     // only for "fixed" tasks: minutes since
                                       // midnight, e.g. 9:00 AM = 540
  "end_minutes": number | null,       // only for "fixed" tasks
  "day_of_week": number | null,       // only for "fixed" tasks that recur
                                       // weekly: 0=Sunday..6=Saturday. Set
                                       // this when the text implies a
                                       // recurring class/commitment (e.g.
                                       // "Math class Mondays 9-10") rather
                                       // than a single one-off event.
  "event_date": "YYYY-MM-DD" | null,  // only for "fixed" tasks that are a
                                       // ONE-OFF event on a specific date
                                       // (e.g. "dentist appointment Friday
                                       // 3pm") rather than a recurring class.
                                       // Mutually exclusive with day_of_week
                                       // — set exactly one of the two for
                                       // "fixed" type, never both.
  "weekly_quota_minutes": number | null // only for "personal" tasks (default 60)
}

Rules:
- "type" classification: schoolwork/homework/assignments/exams -> "flex";
  classes/practice/appointments with a specific fixed time -> "fixed";
  hobbies/rest/chores/social/self-care -> "personal".
- Only populate the fields relevant to the chosen type; set the others to null.
- If duration isn't stated, estimate a reasonable one for the task type.
- Use the exact precomputed dates given above for "today", "tomorrow", and
  weekday names — do not compute dates yourself, and do not default to
  today's date unless the text explicitly says "today" or gives no deadline
  at all.
- For "fixed" type: if the text names a weekday without "just once" framing,
  treat it as recurring (set day_of_week). If it clearly describes a single
  occasion (an appointment, "this Friday only", a specific date), set
  event_date instead. If genuinely ambiguous, prefer day_of_week using
  today's day of week.
- Never include commentary outside the JSON object.`;

export async function POST(request: NextRequest) {
  const { text } = await request.json();

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "No text provided" }, { status: 400 });
  }

  try {
    const parsed = await callGroqJSON(SYSTEM_PROMPT, text);
    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message ?? "Failed to parse task" },
      { status: 502 }
    );
  }
}
