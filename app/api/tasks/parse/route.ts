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
  "weekly_quota_minutes": number | null // only for "personal" tasks (default 60)
}

Rules:
- "type" classification: schoolwork/homework/assignments/exams -> "flex";
  classes/practice/appointments with a specific fixed time -> "fixed";
  hobbies/rest/chores/social/self-care -> "personal".
- Only populate the fields relevant to the chosen type; set the others to null.
- If duration isn't stated, estimate a reasonable one for the task type.
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
