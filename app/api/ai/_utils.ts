import { createAdminClient } from "@/lib/supabase/admin";
import { spendAIUsage, AIUsageUnavailableError, type SpendResult } from "@/lib/server/aiUsageStore";
import { normalizePlan } from "@/lib/plan";
import { getEffectivePlan } from "@/lib/server/plan";
import { callModel, callModelJSON, hasAIProvider } from "@/lib/ai-providers";

// Plan-aware AI limits
// Free:    30 calls/month (monthly cap) AND 3 calls/day (daily burst cap)
// Builder: 1,500/month, 80/day — a high ceiling, not a true "-1 unlimited".
//
// FIX: previously Builder was -1/-1 (genuinely unlimited). Founding members
// convert onto this exact plan (see app/api/billing/checkout/route.ts +
// lib/billing/pricing.ts) via a locked-in discount, so a single high-usage
// founding member with no cap could exhaust the shared Groq/Cerebras/
// OpenRouter free-tier rate limits and degrade the app for every other user,
// regardless of what anyone is paying. 80/day (~2,400/month ceiling if used
// daily) is generous enough that no realistic legitimate usage pattern hits
// it, while still bounding the worst case.
//
// NOTE: if your pricing page advertises "unlimited AI" anywhere, either
// update that copy to something like "generous usage" or raise these numbers
// further — the goal here is a safety ceiling, not a customer-facing wall.
//
// The daily cap prevents a free user from burning their entire monthly
// quota in a single day. The monthly cap remains the binding long-run
// constraint for both plans now.
//
// FEATURE SPLIT (added): these limits used to be shared across every AI
// route — a free user chatting twice with AI Coach had no calls left to
// generate today's action, which is the entire habit loop the product is
// built around. "core" now has its own, much more generous allowance
// reserved for the one-task-a-day generation (today-action route). It is
// naturally used ~1-2x/day by a real user, so a high ceiling here costs
// nothing in practice while guaranteeing the core loop is never blocked by
// usage on the open-ended, more expensive "general" surfaces (Coach,
// Break My Startup, reflections), which keep the original tighter limits.
import { PLAN_MONTHLY_LIMITS, PLAN_DAILY_LIMITS, CORE_MONTHLY_LIMITS, CORE_DAILY_LIMITS } from "@/lib/aiLimits";
export { PLAN_MONTHLY_LIMITS, PLAN_DAILY_LIMITS, CORE_MONTHLY_LIMITS, CORE_DAILY_LIMITS };

export type AIUsageFeature = "general" | "core";

export function hasAdminEnv(): boolean {
  const has = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!has && process.env.NODE_ENV === "production") {
    console.error(
      "[buildmind] SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Memory writes, quality logging, and personalization are disabled. " +
      "Set this env var in Vercel to enable full AI intelligence."
    );
  }
  return has;
}

export function hasGroqKey(): boolean {
  return hasAIProvider();
}

export async function enforceAndTrackAIUsage(
  userId: string,
  planOverride?: string,
  feature: AIUsageFeature = "general",
) {
  if (!hasAdminEnv()) return; // dev mode — skip limits
  const supabase = createAdminClient();

  // FIX #1: Compute date values once at the top — prevents the const re-declaration
  // bug where the second `const d` shadowed the first, making `month` and `today`
  // derive from two different Date objects (potential TZ-boundary mismatch).
  const now = new Date();
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const today = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;

  // Look up a fresh auth user so stale JWT metadata cannot keep Builder users
  // trapped behind free-tier AI caps.
  let plan = normalizePlan(planOverride);
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    plan = await getEffectivePlan(userId);
  } catch {
    plan = normalizePlan(planOverride);
  }

  const monthlyLimits = feature === "core" ? CORE_MONTHLY_LIMITS : PLAN_MONTHLY_LIMITS;
  const dailyLimits    = feature === "core" ? CORE_DAILY_LIMITS   : PLAN_DAILY_LIMITS;
  const monthlyLimit = monthlyLimits[plan] ?? monthlyLimits.free;
  const dailyLimit   = dailyLimits[plan]   ?? dailyLimits.free;

  // Every call is counted here, once, atomically: both caps are checked and
  // both counters incremented in a single step (see lib/server/aiUsageStore.ts).
  let result: SpendResult;
  try {
    result = await spendAIUsage({ userId, feature, month, today, monthlyLimit, dailyLimit });
  } catch (err) {
    // Counters unreachable. A free user fails CLOSED — otherwise a broken
    // counter would silently mean unlimited free AI. Paid users fail open so an
    // outage never blocks someone who is paying.
    console.error("[ai-usage] counter unavailable:", err);
    if (plan === "free") throw new AIUsageUnavailableError();
    return;
  }

  if (result.ok) return;

  if (result.blocked === "daily") {
    const limitLabel = dailyLimit === -1 ? "unlimited" : String(dailyLimit);
    const what = feature === "core" ? "today's action generation" : "AI Coach and other AI features";
    throw new Error(
      `Daily AI limit reached for ${what} (${limitLabel} calls/day on the ${plan} plan). ` +
      `Your limit resets at midnight UTC${plan === "free" ? ", or upgrade to Builder for a much higher ceiling" : ""}.`,
    );
  }
  throw new Error(
    `Monthly AI limit reached (${monthlyLimit} calls).${plan === "free" ? " Upgrade to Builder for far more AI." : ""}`,
  );
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

/**
 * groqReasoningJSON — like groqJSON but routes to the reasoning chain.
 * Use for deep multi-factor analysis (viability scoring, risk critique, founder insight synthesis).
 * Falls back gracefully to the fast chain if reasoning models are unavailable.
 */
export async function groqReasoningJSON<T>(systemPrompt: string, userPrompt: string): Promise<T> {
  return callModelJSON<T>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { role: "reasoning", temperature: 0.2, maxTokens: 1400 },
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
