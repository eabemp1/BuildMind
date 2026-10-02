/**
 * app/api/ai/usage-status/route.ts
 *
 * Server-authoritative AI usage gate.
 * Reads plan from Supabase user_metadata — not localStorage.
 *
 * FIX: previously declared its own FREE_MONTHLY_LIMIT = 50 here, while
 * app/api/ai/_utils.ts (the code that actually BLOCKS calls) enforced 30.
 * A free user could be blocked at 30 real calls while this endpoint still
 * reported room out of 50 — actively misleading. Now imports the exact same
 * constants used for enforcement, so display and enforcement can never drift
 * apart again.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectivePlan } from "@/lib/server/plan";
import { readAIUsage } from "@/lib/server/aiUsageStore";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    }

    // Plan is read from Supabase — trial-aware (getEffectivePlan checks trial_ends_at)
    const plan = await getEffectivePlan(user.id);
    // Same counters enforcement writes (lib/server/aiUsageStore.ts). The Today
    // banner follows the general bucket (Coach and other open-ended AI).
    const usage = await readAIUsage(user.id, plan);
    const monthlyLimit = usage.general.limit;
    const monthlyUsed = usage.general.used;

    // FIX: builder is no longer truly "-1 unlimited" (see app/api/ai/_utils.ts) —
    // it now has a generous but real ceiling. Report it accurately instead of
    // always claiming "unlimited", which would hide a real approaching limit
    // from a heavy builder-plan user.
    return NextResponse.json({
      ok: true,
      userId: user.id,
      plan,
      monthlyUsed,
      monthlyLimit,
      unlimited: false,
      hitLimit: monthlyUsed >= monthlyLimit,
      buckets: { general: usage.general, core: usage.core },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
      }
