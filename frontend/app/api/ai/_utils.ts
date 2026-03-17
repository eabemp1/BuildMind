import { createAdminClient } from "@/lib/supabase/admin";

const MONTHLY_LIMIT = 20;

export function hasAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function enforceAndTrackAIUsage(userId: string) {
  if (!hasAdminEnv()) return;
  const supabase = createAdminClient();
  const d = new Date();
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const { data: existing, error: selectError } = await supabase
    .from("ai_usage")
    .select("id,count")
    .eq("user_id", userId)
    .eq("month", month)
    .single();

  if (selectError && selectError.code !== "PGRST116") {
    throw new Error(selectError.message);
  }

  if (!existing) {
    const { error: insertError } = await supabase
      .from("ai_usage")
      .insert({ user_id: userId, month, count: 1 });
    if (insertError) throw new Error(insertError.message);
    return;
  }

  if ((existing.count ?? 0) >= MONTHLY_LIMIT) {
    throw new Error("Monthly AI generation limit reached (20).");
  }

  const { error: updateError } = await supabase
    .from("ai_usage")
    .update({ count: (existing.count ?? 0) + 1 })
    .eq("id", existing.id);
  if (updateError) throw new Error(updateError.message);
}

export async function groqJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || "llama-3.1-70b-versatile";
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq request failed: ${text}`);
  }

  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Invalid Groq response.");
  return JSON.parse(content) as T;
}

export async function createUserNotification(userId: string, message: string, type = "ai_recommendation") {
  if (!hasAdminEnv()) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert({
    user_id: userId,
    type,
    message,
    is_read: false,
  });
}
