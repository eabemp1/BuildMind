import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planFromUserMetadata, TRIAL_DURATION_DAYS } from "@/lib/plan";
import { getEffectivePlan, getFreshAuthUser } from "@/lib/server/plan";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return NextResponse.json({ ok: false, authenticated: false, plan: "free" });
  }

  if (!user) {
    return NextResponse.json({ ok: false, authenticated: false, plan: "free" });
  }

  const freshUser = await getFreshAuthUser(user);
  const basePlan = planFromUserMetadata(freshUser);
  let subscriptionStatus: string | null = null;
  let subscriptionProvider: string | null = null;
  let subscriptionPeriodEnd: string | null = null;

  // ── Free Trial: read from founder_context (server-authoritative) ──────────
  // If the auth callback missed trial creation, bootstrap it here so a new
  // signed-in free user never loses trial access because one redirect failed.
  let trialActive = false;
  let trialExpired = false;
  let trialDaysRemaining = 0;
  let trialEndsAt: string | null = null;

  try {
    const admin = createAdminClient();
    const { data: sub } = await admin
      .from("subscriptions")
      .select("status, provider, current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    subscriptionStatus = typeof sub?.status === "string" ? sub.status : null;
    subscriptionProvider = typeof sub?.provider === "string" ? sub.provider : null;
    subscriptionPeriodEnd = typeof sub?.current_period_end === "string" ? sub.current_period_end : null;

    const { data: ctx } = await admin
      .from("founder_context")
      .select("trial_started_at, trial_ends_at, trial_expired")
      .eq("user_id", user.id)
      .maybeSingle();

    let trialRow = ctx;
    const metaEndsAt = freshUser.user_metadata?.trial_ends_at;
    if (!trialRow?.trial_started_at && !metaEndsAt && basePlan !== "builder" && !freshUser.user_metadata?.billing_status) {
      const trialStartedAt = new Date().toISOString();
      const trialEndsAtNew = new Date(
        new Date(trialStartedAt).getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data: inserted } = await admin
        .from("founder_context")
        .insert({
          user_id: user.id,
          trial_started_at: trialStartedAt,
          trial_ends_at: trialEndsAtNew,
          trial_expired: false,
        })
        .select("trial_started_at, trial_ends_at, trial_expired")
        .maybeSingle();

      if (inserted) {
        trialRow = inserted;
      } else {
        const { data: existing } = await admin
          .from("founder_context")
          .select("trial_started_at, trial_ends_at, trial_expired")
          .eq("user_id", user.id)
          .maybeSingle();
        trialRow = existing;
      }

      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...((freshUser.user_metadata as Record<string, unknown>) ?? {}),
          trial_started_at: trialStartedAt,
          trial_ends_at: trialEndsAtNew,
        },
      });
    } else if (!trialRow?.trial_ends_at && metaEndsAt) {
      const trialStartedAt = freshUser.user_metadata?.trial_started_at ?? new Date(
        new Date(metaEndsAt).getTime() - TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      await admin
        .from("founder_context")
        .update({
          trial_started_at: trialStartedAt,
          trial_ends_at: metaEndsAt,
          trial_expired: false,
        })
        .eq("user_id", user.id)
        .is("trial_ends_at", null);

      trialRow = {
        trial_started_at: trialStartedAt,
        trial_ends_at: metaEndsAt,
        trial_expired: false,
      };
    }

    const effectiveEndsAt = trialRow?.trial_ends_at ?? metaEndsAt;
    if (effectiveEndsAt) {
      trialEndsAt = effectiveEndsAt;
      const now = new Date();
      const ends = new Date(effectiveEndsAt);

      if (trialRow?.trial_expired || ends <= now) {
        // Trial has expired. Freemium users fall back to the Free plan; Builder
        // access is decided independently by the subscription lookup below.
        trialExpired = true;
        if (!trialRow?.trial_expired) {
          // Mark expired server-side (best-effort)
          await admin
            .from("founder_context")
            .update({ trial_expired: true })
            .eq("user_id", user.id);
        }
      } else {
        // Trial is active — grant full Builder access
        trialActive = true;
        trialDaysRemaining = Math.ceil((ends.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      }
    }
  } catch {
    // Non-fatal — fall through with trial fields as false
  }

  // Effective plan: active trial grants Builder; otherwise use canonical
  // subscription state. Expired trial never creates a global hard paywall.
  const effectivePlan = await getEffectivePlan(user.id);

  return NextResponse.json({
    ok: true,
    authenticated: true,
    plan: effectivePlan,
    basePlan,
    // Trial fields (used by client to show trial banner + hard paywall)
    trial: {
      active: trialActive,
      expired: trialExpired,
      daysRemaining: trialDaysRemaining,
      endsAt: trialEndsAt,
      durationDays: TRIAL_DURATION_DAYS,
    },
    billingProvider: subscriptionProvider ?? freshUser.user_metadata?.billing_provider ?? null,
    billingStatus: subscriptionStatus ?? freshUser.user_metadata?.billing_status ?? null,
    currentPeriodEnd: subscriptionPeriodEnd ?? freshUser.user_metadata?.billing_current_period_end ?? null,
    updatedAt: freshUser.user_metadata?.billing_updated_at ?? null,
  });
}
