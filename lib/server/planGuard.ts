/**
 * lib/server/planGuard.ts — Server-side plan enforcement for Next.js API routes
 *
 * AUDIT FIX C3: createServerClient now uses NEXT_PUBLIC_SUPABASE_ANON_KEY
 * instead of SUPABASE_SERVICE_ROLE_KEY for session validation via auth.getUser().
 * The service role key is for admin database queries (RLS bypass), not for
 * validating user session JWTs. Using it here silently bypassed RLS for the
 * entire request context.
 *
 * AUDIT FIX C1: getFreshPlanForUser() replaced with getEffectivePlan() so
 * trial users are correctly treated as "builder" in all guard paths.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type Plan } from "@/lib/plan";
import { getEffectivePlan } from "@/lib/server/plan";

export type GuardedHandler = (
  req: NextRequest,
  user: { id: string; email?: string },
  plan: Plan,
) => Promise<NextResponse> | NextResponse;

const PLAN_ORDER: Plan[] = ["free", "builder"];

function planMeetsRequirement(actual: Plan, required: Plan): boolean {
  const actualIdx = PLAN_ORDER.indexOf(actual);
  const requiredIdx = PLAN_ORDER.indexOf(required);
  if (actualIdx < 0 || requiredIdx < 0) return false;
  return actualIdx >= requiredIdx;
}

/**
 * Wrap a Next.js Route Handler with server-side plan enforcement.
 *
 * @param requiredPlan  Minimum plan tier required ("builder" — only active paid tier)
 * @param handler       The route handler to call if the check passes
 */
export function withPlanGuard(
  requiredPlan: Plan,
  handler: GuardedHandler,
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest): Promise<NextResponse> => {
    const cookieStore = await cookies();

    // FIX C3: Use ANON_KEY for session validation — NOT the service role key.
    // auth.getUser() validates the session JWT against Supabase Auth; it does
    // not need (and must not use) admin-level credentials for that operation.
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    // FIX C1: Use getEffectivePlan() so trial users are correctly treated as builder
    const effectivePlan = await getEffectivePlan(user.id);

    if (!planMeetsRequirement(effectivePlan, requiredPlan)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Plan upgrade required",
          required: requiredPlan,
          current: effectivePlan,
        },
        { status: 403 },
      );
    }

    return handler(req, { id: user.id, email: user.email }, effectivePlan);
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

  // FIX C3: Use ANON_KEY here too
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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
    plan: await getEffectivePlan(user.id),
    userId: user.id,
  };
}
