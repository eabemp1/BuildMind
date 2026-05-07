/**
 * app/api/ai/usage-status/route.ts
 *
 * Server-authoritative AI usage gate. 
 * Reads plan from Supabase user_metadata — not localStorage.
 * Builder plan: unlimited (-1). Free plan: 50/month.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_LIMITS } from "@/lib/plan";
import { getFreshPlanForUser } from "@/lib/server/plan";

const FREE_MONTHLY_LIMIT = 50;

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
    }

    // Plan is read from Supabase user_metadata — NOT localStorage
    const plan = await getFreshPlanForUser(user);
    const limits = PLAN_LIMITS[plan];

    // Builder plan = unlimited AI
    if (limits.aiMessagesPerDay === -1) {
      return NextResponse.json({
        ok: true,
        userId: user.id,
        plan,
        monthlyUsed: 0,
        monthlyLimit: -1,
        unlimited: true,
        hitLimit: false,
      });
    }

    // Free plan — check monthly usage from Supabase ai_usage table
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
        .single();
      monthlyUsed = usage?.count ?? 0;
    } catch {
      // ai_usage table may not exist — treat as 0
    }

    const monthlyLimit = FREE_MONTHLY_LIMIT;
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
