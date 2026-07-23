// Minimal helper for calling Groq's OpenAI-compatible chat completions API.
export async function callGroqJSON(
  system: string,
  user: string
): Promise<any> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Groq API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned no content");

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Groq response wasn't valid JSON");
  }
}

import {
  todayISOInTZ,
  weekdayNameInTZ,
  addDaysISOInTZ,
} from "./timezone";

// "2026-07-23" style date, plus day-of-week name, for grounding relative
// dates ("Friday", "next week") in prompts sent to Groq. Also precomputes
// tomorrow and the day after, since LLMs are unreliable at date arithmetic
// on their own — better to hand them the answer than ask them to compute it.
//
// Crucially, all of this is computed in the user's own timezone (see
// lib/timezone.ts / lib/userSettings.ts) rather than the server's raw
// system clock — Vercel runs in UTC, so without this, "today" server-side
// could silently disagree with the user's actual local day.
export function todayContext(tz: string): string {
  const today = todayISOInTZ(tz);
  const weekday = weekdayNameInTZ(tz);
  const tomorrow = addDaysISOInTZ(tz, 1);
  const dayAfter = addDaysISOInTZ(tz, 2);

  const weekdayDates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + i);
    weekdayDates.push(`${weekdayNameInTZ(tz, d)} = ${addDaysISOInTZ(tz, i)}`);
  }

  return `Today is ${weekday}, ${today}.
"tomorrow" = ${tomorrow}. "day after tomorrow" = ${dayAfter}.
Upcoming weekday dates (use these exact values, do not compute your own): ${weekdayDates.join(", ")}.`;
}
