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
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/server/plan";
import { PLAN_MONTHLY_LIMITS } from "@/app/api/ai/_utils";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    }

    // Plan is read from Supabase — trial-aware (getEffectivePlan checks trial_ends_at)
    const plan = await getEffectivePlan(user.id);
    const monthlyLimit = PLAN_MONTHLY_LIMITS[plan] ?? PLAN_MONTHLY_LIMITS.free;

    const now = new Date();
    const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    let monthlyUsed = 0;
    try {
      const admin = createAdminClient();
      const { data: usage } = await admin
        .from("ai_usage")
        .select("count")
        .eq("user_id", user.id)
        .eq("month", month)
        .maybeSingle();
      monthlyUsed = usage?.count ?? 0;
    } catch {
      // ai_usage table may not exist yet (migration pending) — treat as 0
      // rather than failing the whole request; this is display-only.
    }

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
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
