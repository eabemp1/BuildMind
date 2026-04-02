import { createAdminClient } from "@/lib/supabase/admin";

const MONTHLY_LIMIT = 50; // raised from 20 for beta testers

export function hasAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasGroqKey(): boolean {
  return Boolean(process.env.GROQ_API_KEY);
}

export async function enforceAndTrackAIUsage(userId: string) {
  if (!hasAdminEnv()) return; // dev mode — skip limits
  const supabase = createAdminClient();
  const d = new Date();
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: existing, error: selectError } = await supabase
    .from("ai_usage")
    .select("id,count")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  if (selectError && selectError.code !== "PGRST116") throw new Error(selectError.message);

  if (!existing) {
    await supabase.from("ai_usage").insert({ user_id: userId, month, count: 1 });
    return;
  }
  if ((existing.count ?? 0) >= MONTHLY_LIMIT) {
    throw new Error("Monthly AI limit reached. Upgrade to continue.");
  }
  await supabase.from("ai_usage").update({ count: (existing.count ?? 0) + 1 }).eq("id", existing.id);
}

/**
 * groqChat — calls Groq with plain text response (not JSON mode).
 * Use this for conversational AI coach responses.
 */
export async function groqChat(systemPrompt: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Add it to your Vercel environment variables at vercel.com/your-project/settings/environment-variables");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      max_tokens: 800,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty response");
  return content as string;
}

/**
 * groqJSON — calls Groq expecting a JSON object response.
 * Use this for structured data (roadmaps, analysis, etc).
 */
export async function groqJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set. Add it to Vercel environment variables.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      max_tokens: 1200,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq error ${response.status}: ${text.slice(0, 300)}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq returned empty response");

  try {
    return JSON.parse(content) as T;
  } catch {
    throw new Error(`Groq returned invalid JSON: ${content.slice(0, 200)}`);
  }
}

export async function createUserNotification(userId: string, message: string, type = "ai_recommendation") {
  if (!hasAdminEnv()) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert({ user_id: userId, type, message, is_read: false });
}
