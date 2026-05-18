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
 * Returns "builder" if the user has an active free trial, regardless of
 * what is stored in user_metadata. Falls back to getFreshPlanForUser()
 * for all other cases.
 *
 * This is the function that should be called in every plan guard path.
 * getFreshPlanForUser() should only be called directly when you explicitly
 * want the paid-plan check without trial consideration.
 */
export async function getEffectivePlan(userId: string): Promise<Plan> {
  if (!hasAdminPlanLookupEnv()) return "free";

  try {
    const admin = createAdminClient();

    // Check trial status first — runs a single indexed lookup on user_id
    const { data: ctx } = await admin
      .from("founder_context")
      .select("trial_ends_at")
      .eq("user_id", userId)
      .single();

    if (ctx?.trial_ends_at) {
      const trialEnd = new Date(ctx.trial_ends_at);
      if (trialEnd > new Date()) {
        // Active trial — treat as builder
        return "builder";
      }
    }

    // No active trial — fall back to metadata plan
    const { data: authUser } = await admin.auth.admin.getUserById(userId);
    return planFromUserMetadata(authUser?.user);
  } catch {
    return "free"; // fail closed
  }
}
