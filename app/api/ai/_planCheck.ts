/**
 * app/api/ai/_planCheck.ts — Inline server-side plan enforcement
 *
 * Used inside existing route handlers (which can't use the withPlanGuard wrapper
 * because they parse request bodies themselves).
 *
 * USAGE:
 *   const planResult = await checkPlanAccess("venture");
 *   if (!planResult.ok) return planResult.response;
 *   // ...proceed
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan, type Plan } from "@/lib/plan";

const PLAN_ORDER: Plan[] = ["free", "builder"];

function meetsRequirement(actual: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(actual) >= PLAN_ORDER.indexOf(required);
}

interface PlanCheckOk {
  ok: true;
  plan: Plan;
  userId: string;
  response?: never;
}
interface PlanCheckFail {
  ok: false;
  plan?: never;
  userId?: never;
  response: NextResponse;
}
type PlanCheckResult = PlanCheckOk | PlanCheckFail;

export async function checkPlanAccess(requiredPlan: Plan): Promise<PlanCheckResult> {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }),
      };
    }

    const plan = normalizePlan(user.user_metadata?.plan as string | undefined);

    if (!meetsRequirement(plan, requiredPlan)) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            ok: false,
            error: "Plan upgrade required",
            required: requiredPlan,
            current: plan,
            upgradeUrl: "/upgrade",
          },
          { status: 403 }
        ),
      };
    }

    return { ok: true, plan, userId: user.id };
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, error: "Auth check failed" }, { status: 500 }),
    };
  }
}

/** For free-tier routes: just get the plan without gating */
export async function getRouteUser(): Promise<{ plan: Plan; userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return {
      plan: normalizePlan(user.user_metadata?.plan as string | undefined),
      userId: user.id,
    };
  } catch {
    return null;
  }
}
