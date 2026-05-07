/**
 * lib/server/planGuard.ts — Server-side plan enforcement for Next.js API routes
 *
 * WHY THIS EXISTS:
 *   lib/plan.ts getPlan() reads from localStorage — client-side only.
 *   Any feature gate that relies solely on that can be bypassed by setting
 *   localStorage.setItem('bm_plan', 'venture') in the browser console.
 *
 *   This module provides withPlanGuard(), a Next.js Route Handler wrapper that
 *   reads the plan from Supabase user_metadata (server-side, signed JWT) before
 *   the handler runs. If the user's actual plan doesn't meet the required tier, a
 *   403 is returned — no client code involved.
 *
 * USAGE:
 *   // app/api/ventures/generate/route.ts
 *   import { withPlanGuard } from "@/lib/server/planGuard";
 *
 *   export const POST = withPlanGuard("venture", async (req, user, plan) => {
 *     return NextResponse.json({ ok: true });
 *   });
 *
 * ROUTES TO PROTECT (audit these):
 *   app/api/ventures/generate/route.ts      → "venture"
 *   app/api/cofounder/blueprint/route.ts    → "venture"
 *   app/api/cofounder/reframe/route.ts      → "builder"
 *   app/api/ai/coach/route.ts               → "builder" (unlimited tier)
 *   app/api/ai/weekly-report/route.ts       → "builder"
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type Plan } from "@/lib/plan";
import { getFreshPlanForUser } from "@/lib/server/plan";

export type GuardedHandler = (
  req: NextRequest,
  user: { id: string; email?: string },
  plan: Plan,
) => Promise<NextResponse> | NextResponse;

const PLAN_ORDER: Plan[] = ["free", "builder"];

function planMeetsRequirement(actual: Plan, required: Plan): boolean {
  return PLAN_ORDER.indexOf(actual) >= PLAN_ORDER.indexOf(required);
}

/**
 * Wrap a Next.js Route Handler with server-side plan enforcement.
 *
 * @param requiredPlan  Minimum plan tier required ("builder" | "venture")
 * @param handler       The route handler to call if the check passes
 */
export function withPlanGuard(
  requiredPlan: Plan,
  handler: GuardedHandler,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: () => {},
        },
      },
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const metadataPlan = await getFreshPlanForUser(user);

    if (!planMeetsRequirement(metadataPlan, requiredPlan)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Plan upgrade required",
          required: requiredPlan,
          current: metadataPlan,
        },
        { status: 403 },
      );
    }

    return handler(req, { id: user.id, email: user.email }, metadataPlan);
  };
}

/**
 * Read the current user's server-verified plan without gating.
 * Useful for metering, analytics, or conditional logic inside a handler.
 */
export async function getServerPlan(): Promise<{
  plan: Plan;
  userId: string | null;
}> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { plan: "free", userId: null };

  return {
    plan: await getFreshPlanForUser(user),
    userId: user.id,
  };
}
