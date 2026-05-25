import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";

// Allowlist of valid step names — prevents analytics pollution from arbitrary
// strings passed by scrapers or curious developers hitting the endpoint directly.
const VALID_STEPS = new Set([
  "landing_view", "signup", "onboarding_start", "identity_input_complete",
  "reflexion_strike_started", "reflexion_strike_shown", "reflexion_strike_fallback",
  "reflexion_strike_accepted", "founder_state_complete", "depth_questions_answered",
  "stage_selected", "identity_complete", "onboarding_complete",
  "first_task_completed", "first_reflect",
]);

export async function POST(req: NextRequest) {
  const limit = await rateLimitAsync(`funnel:${getClientIp(req)}`, 120, 60 * 1000);
  if (!limit.ok) return NextResponse.json({ ok: true });

  const { step } = await req.json().catch(() => ({}));
  // Silently ignore unknown steps — return 200 so clients don't retry
  if (!step || !VALID_STEPS.has(step)) return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  try {
    await admin.rpc("increment_funnel_step", { p_step: step });
  } catch (err) {
    // Silently fail — table may not exist yet
    console.warn("[funnel-event] increment_funnel_step failed:", err);
  }
  return NextResponse.json({ ok: true });
}
