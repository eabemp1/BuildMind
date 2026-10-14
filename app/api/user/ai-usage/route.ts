import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPlanContext } from "@/lib/server/plan";
import { readAIUsage } from "@/lib/server/aiUsageStore";

/**
 * GET /api/user/ai-usage — what the usage badge shows.
 *
 * Reads through lib/server/aiUsageStore.ts (the same counters enforcement
 * writes) and reports the bucket with the FEWEST calls left, because that is
 * the one that will block the founder first. Limits come from lib/aiLimits.ts,
 * not a hard-coded 30.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // Trial-aware: trial users get Builder-level access.
  const { plan, trial } = await getPlanContext(user.id);
  // Paying Builder = effectively unlimited for display. Trials have their own limits.
  if (plan === "builder" && !trial) {
    return NextResponse.json({ ok: true, plan: "builder", unlimited: true });
  }

  const usage = await readAIUsage(user.id, trial ? "trial" : plan);
  const tighter = usage.core.remaining < usage.general.remaining ? "core" : "general";
  const b = usage[tighter];
  return NextResponse.json({
    ok: true,
    plan,
    trial,
    unlimited: false,
    bucket: tighter,
    used: b.used,
    limit: b.limit,
    remaining: b.remaining,
    buckets: { general: usage.general, core: usage.core },
  });
}
