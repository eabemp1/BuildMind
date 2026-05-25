/**
 * lib/server/plan.ts — Server-side plan resolution
 *
 * AUDIT FIX C1 + H2:
 *   getEffectivePlan() replaces getFreshPlanForUser() as the single source of
 *   truth for plan resolution in all plan guard and AI usage paths.
 *
 *   Trial users have plan = "free" in their JWT metadata because they haven't
 *   paid. getFreshPlanForUser() reads only user_metadata, so every trial user
 *   was treated as free — blocking them from all builder-gated routes and
 *   applying the 3-call/day free limit instead of unlimited builder limits.
 *
 *   getEffectivePlan() checks founder_context.trial_ends_at first. If the
 *   trial is still active it returns "builder" regardless of JWT metadata.
 *   It falls back to getFreshPlanForUser() for non-trial users.
 *
 * USAGE:
 *   Replace every getFreshPlanForUser() call in planGuard.ts, _planCheck.ts,
 *   and _utils.ts with getEffectivePlan(userId).
 */

import { planFromUserMetadata, type Plan } from "@/lib/plan";
import { createAdminClient } from "@/lib/supabase/admin";

type UserLike = {
  id?: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
} | null | undefined;

export function hasAdminPlanLookupEnv(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function getFreshAuthUser<T extends UserLike>(user: T): Promise<T> {
  if (!user?.id || !hasAdminPlanLookupEnv()) return user;

  try {
    const admin = createAdminClient();
    const { data } = await admin.auth.admin.getUserById(user.id);
    return (data.user as T) ?? user;
  } catch {
    return user;
  }
}

export async function getFreshPlanForUser(user: UserLike): Promise<Plan> {
  const freshUser = await getFreshAuthUser(user);
  return planFromUserMetadata(freshUser);
}

/**
 * getEffectivePlan — trial-aware plan resolution.
 *
 * A2 FIX: subscriptions table is now the canonical source of truth.
 * Read order:
 *   1. founder_context.trial_ends_at  — active trial → "builder" immediately
 *   2. subscriptions.plan + status    — paid subscription canonical record
 *   3. user_metadata (JWT cache)      — fallback if subscriptions row absent
 *      (e.g. legacy accounts that predated the subscriptions table)
 *
 * This eliminates the desync window where a webhook failure left
 * user_metadata on "free" while subscriptions had "builder".
 */
export async function getEffectivePlan(userId: string): Promise<Plan> {
  if (!hasAdminPlanLookupEnv()) return "free";

  try {
    const admin = createAdminClient();

    // 1. Active trial check — single indexed lookup, fast path
    const { data: ctx } = await admin
      .from("founder_context")
      .select("trial_ends_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (ctx?.trial_ends_at && new Date(ctx.trial_ends_at) > new Date()) {
      return "builder";
    }

    // 2. Canonical plan from subscriptions table (A2 fix — primary source)
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (sub?.plan) {
      // Only grant builder if the subscription is in an active/grace state
      const activeStatuses = ["active", "grace", "trialing"];
      if (sub.plan === "builder" && !activeStatuses.includes(sub.status ?? "")) {
        return "free";
      }
      return sub.plan as Plan;
    }

    // 3. Legacy fallback — user_metadata JWT cache (pre-subscriptions accounts)
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    return planFromUserMetadata(authUser?.user);
  } catch {
    return "free"; // fail closed
  }
}
