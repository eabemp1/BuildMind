import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan } from "@/lib/plan";
import { getEffectivePlan } from "@/lib/server/plan";
import { callModel, callModelJSON, hasAIProvider } from "@/lib/ai-providers";

// Plan-aware AI limits
// Free:    30 calls/month (monthly cap) AND 3 calls/day (daily burst cap)
// Builder: unlimited (-1). Venture tier removed — features folded into Builder (Playbook v4).
//
// The daily cap (3) prevents a free user from burning their entire monthly
// quota in a single day. The monthly cap (30) remains the binding long-run
// constraint. Builder users have no caps — usage is tracked for analytics only.
const PLAN_MONTHLY_LIMITS: Record<string, number> = {
  free: 30,
  builder: -1,
};

const PLAN_DAILY_LIMITS: Record<string, number> = {
  free: 3,
  builder: -1,  // unlimited — still tracked for analytics
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

  const monthlyLimit = PLAN_MONTHLY_LIMITS[plan] ?? 30;
  const dailyLimit   = PLAN_DAILY_LIMITS[plan]   ?? 3;

  // ── Step 1: Daily cap check (fires first to prevent burst abuse) ───────────
  // Run the daily check before the monthly check so a free user who has
  // used 0 monthly calls cannot call the API 30 times in one day.

  const { data: dailyCount, error: dailyError } = await supabase.rpc(
    "increment_ai_usage_daily_capped",
    { p_user_id: userId, p_date: today, p_limit: dailyLimit },
  );

  if (dailyError) throw new Error(dailyError.message);

  // RPC returns -1 when the daily limit is already reached.
  if (dailyCount === -1) {
    const limitLabel = dailyLimit === -1 ? "unlimited" : String(dailyLimit);
    throw new Error(
      `Daily AI limit reached (${limitLabel} calls/day on the free plan). ` +
      `Your limit resets at midnight UTC, or upgrade to Builder for unlimited AI.`,
    );
  }

  // ── Step 2: Monthly cap check ──────────────────────────────────────────────
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
  // Note: daily count was already incremented above — we must decrement it back
  // to keep daily and monthly counts in sync when the monthly cap is the blocker.
  if (newCount === -1) {
    // Best-effort rollback of the daily increment (non-throwing).
    // Use a dedicated decrement RPC; increment_ai_usage_daily_capped(-1) is
    // the unlimited increment path, not a decrement path.
    try {
      await supabase.rpc("decrement_ai_usage_daily", { p_user_id: userId, p_date: today });
    } catch {
      // Fallback for environments that have not run the decrement RPC migration.
      await supabase
        .from("ai_usage_daily")
        .update({ count: Math.max(0, Number(dailyCount ?? 1) - 1) })
        .eq("user_id", userId)
        .eq("date", today);
    }
    throw new Error(
      `Monthly AI limit reached (${monthlyLimit} calls). Upgrade to Builder for unlimited AI.`,
    );
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
