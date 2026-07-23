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

// "2026-07-23" style date, plus day-of-week name, for grounding relative
// dates ("Friday", "next week") in prompts sent to Groq.
export function todayContext(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const weekday = now.toLocaleDateString("en-US", { weekday: "long" });
  return `Today is ${weekday}, ${date}.`;
}
