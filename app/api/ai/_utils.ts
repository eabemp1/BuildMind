import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan } from "@/lib/plan";
import { getFreshPlanForUser } from "@/lib/server/plan";
import { callModel, callModelJSON, hasAIProvider } from "@/lib/ai-providers";

// Plan-aware monthly AI limits
// Free: 30 calls/month (3/day × 30 days, but we cap monthly for safety)
// Builder/Venture: unlimited (-1)
const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 30,
  builder: -1,
  venture: -1,
};

export function hasAdminEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function hasGroqKey(): boolean {
  return hasAIProvider();
}

export async function enforceAndTrackAIUsage(userId: string, planOverride?: string) {
  if (!hasAdminEnv()) return; // dev mode — skip limits
  const supabase = createAdminClient();
  const d = new Date();
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  // Look up a fresh auth user so stale JWT metadata cannot keep Builder users
  // trapped behind free-tier AI caps.
  let plan = normalizePlan(planOverride);
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    plan = await getFreshPlanForUser(authUser?.user);
  } catch {
    plan = normalizePlan(planOverride);
  }

  const monthlyLimit = PLAN_MONTHLY_LIMITS[plan] ?? 30;

  // Builder/Venture: unlimited — just track via atomic upsert, no cap needed.
  if (monthlyLimit === -1) {
    await supabase.rpc("increment_ai_usage", { p_user_id: userId, p_month: month });
    return;
  }

  // Free plan: atomically increment and read back the new count in one round-trip.
  // Using a Postgres RPC prevents the SELECT→UPDATE race condition where two
  // concurrent requests both read the same count and both think they're under limit.
  const { data: newCount, error: rpcError } = await supabase.rpc("increment_ai_usage_capped", {
    p_user_id: userId,
    p_month: month,
    p_limit: monthlyLimit,
  });

  if (rpcError) throw new Error(rpcError.message);

  // RPC returns -1 when the limit is already reached (no increment performed).
  if (newCount === -1) {
    throw new Error(`Monthly AI limit reached (${monthlyLimit} calls). Upgrade to Builder for unlimited AI.`);
  }
}

/**
 * groqChat — calls Groq with plain text response (not JSON mode).
 * Use this for conversational AI coach responses.
 */
export async function groqChat(systemPrompt: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  return callModel(
    [{ role: "system", content: systemPrompt }, ...messages],
    { role: "fast", temperature: 0.7, maxTokens: 800 },
  );
}

/**
 * groqJSON — calls Groq expecting a JSON object response.
 * Use this for structured data (roadmaps, analysis, etc).
 */
export async function groqJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  return callModelJSON<T>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { role: "fast", temperature: 0.3, maxTokens: 1200 },
  );
}

export async function createUserNotification(userId: string, message: string, type = "ai_recommendation") {
  if (!hasAdminEnv()) return;
  const supabase = createAdminClient();
  await supabase.from("notifications").insert({ user_id: userId, type, message, is_read: false });
}

/**
 * logReflexionQuality — runs Agent B's checklist against a generated output
 * and writes the verdict to reflexion_quality_log.
 *
 * Called fire-and-forget from every route that generates AI tasks.
 * This is what makes the gatekeeper measurable — without logging, you cannot
 * know if it's rejecting 0% or 40% of outputs.
 */
export async function logReflexionQuality(params: {
  userId: string;
  projectId?: string;
  context: string;          // "today_action" | "coach" | "morning_briefing" | etc.
  originalOutput?: string;  // what Agent A generated (optional)
  finalOutput: string;      // what was actually returned to the user
  stage?: string;
  targetUsers?: string;
  momentumScore?: number;
}): Promise<void> {
  if (!hasAdminEnv()) return;
  const { createAdminClient: adminClient } = await import("@/lib/supabase/admin");
  const supabase = adminClient();

  // Run the same specificity checklist as Agent B
  const checks = {
    hasNumber:       /\b\d+\b/.test(params.finalOutput),
    hasPlatform:     /(linkedin|whatsapp|email|twitter|phone|in person|slack|telegram|instagram)/i.test(params.finalOutput),
    hasUserType:     params.targetUsers ? params.finalOutput.toLowerCase().includes(params.targetUsers.toLowerCase().split(" ")[0]) : true,
    notTooGeneric:   !/\b(some people|potential users|your audience|people who)\b/i.test(params.finalOutput),
    hasConcreteVerb: /(message|call|send|post|dm|email|reach out to|interview|show|share|pitch)/i.test(params.finalOutput),
  };

  const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
  const verdict: "pass" | "fail" = failedChecks.length === 0 ? "pass" : "fail";
  const reject_reason = failedChecks.length > 0
    ? `Failed: ${failedChecks.join(", ")}`
    : null;

  await supabase.from("reflexion_quality_log").insert({
    user_id:        params.userId,
    project_id:     params.projectId ?? null,
    context:        params.context,
    verdict,
    reject_reason,
    original_output: params.originalOutput ?? null,
    final_output:   params.finalOutput,
    stage:          params.stage ?? null,
    momentum_score: params.momentumScore ?? null,
  });
}
