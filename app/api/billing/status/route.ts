import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { type Plan, TRIAL_DURATION_DAYS } from "@/lib/plan";
import { getEffectivePlan } from "@/lib/server/plan";
import { createAdminClient } from "@/lib/supabase/admin";
import { claimTrial, spentTrialRow } from "@/lib/server/trialGuard";

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

  let basePlan: Plan = "free";
  // A paying customer is not on a trial, even if the original trial window is still open (same rule as getPlanContext).
  let payingSubscriber = false;
  let subscriptionStatus: string | null = null;
  let subscriptionProvider: string | null = null;
  let subscriptionPeriodEnd: string | null = null;
  let subscriptionCanceledAt: string | null = null;
  let subscriptionUpdatedAt: string | null = null;

  // ── Free Trial: read from founder_context (server-authoritative) ──────────
  // If the auth callback missed trial creation, bootstrap it here so a new
  // signed-in free user never loses trial access because one redirect failed.
  let trialActive = false;
  let trialExpired = false;
  let trialDaysRemaining = 0;
  let trialEndsAt: string | null = null;

  try {
    const admin = createAdminClient();
    const { data: sub, error: subError } = await admin
      .from("subscriptions")
      .select("plan, status, provider, current_period_end, grace_period_ends_at, canceled_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subError) throw subError; // A read failure must not look like trial eligibility.
    const status = String(sub?.status ?? "").toLowerCase();
    const periodValid = !sub?.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
    const graceValid = sub?.grace_period_ends_at ? new Date(sub.grace_period_ends_at).getTime() > Date.now() : false;
    payingSubscriber = sub?.plan === "builder" && (
      (status === "active" && periodValid) || (status === "grace" && graceValid)
    );
    basePlan = payingSubscriber ? "builder" : "free";
    subscriptionUpdatedAt = typeof sub?.updated_at === "string" ? sub.updated_at : null;
    subscriptionStatus = typeof sub?.status === "string" ? sub.status : null;
    subscriptionProvider = typeof sub?.provider === "string" ? sub.provider : null;
    subscriptionPeriodEnd = typeof sub?.current_period_end === "string" ? sub.current_period_end : null;

    subscriptionCanceledAt = typeof sub?.canceled_at === "string" ? sub.canceled_at : null;

    const { data: ctx, error: ctxError } = await admin
      .from("founder_context")
      .select("trial_started_at, trial_ends_at, trial_expired")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ctxError) throw ctxError;
    let trialRow = ctx;
    // One trial per real person (verified, non-disposable, normalised email).
    // Only evaluated when this request would otherwise bootstrap a trial.
    const wouldBootstrap = !trialRow?.trial_started_at && !trialRow?.trial_ends_at && !trialRow?.trial_expired && basePlan !== "builder" && (!subscriptionStatus || subscriptionStatus === "free");
    const trialDecision = wouldBootstrap ? await claimTrial(admin, user) : null;
    if (trialDecision?.action === "deny") {
      await admin.from("founder_context").upsert(spentTrialRow(user.id), { onConflict: "user_id", ignoreDuplicates: true });
      const iso = new Date().toISOString();
      trialRow = { trial_started_at: iso, trial_ends_at: iso, trial_expired: true };
    }
    if (wouldBootstrap && trialDecision?.action === "grant") {
      const trialStartedAt = new Date().toISOString();
      const trialEndsAtNew = new Date(
        new Date(trialStartedAt).getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      // FIX: previously a plain .insert() — this route almost certainly
      // fires on most page loads (checking trial/billing status), making
      // it the most likely dominant source of the 611 duplicate
      // founder_context rows found on one heavily-active account. Two
      // concurrent requests (multiple tabs, fast navigation) could both see
      // no trial row yet and both insert. There WAS a fallback below for
      // when the insert failed — but a plain insert with no unique
      // constraint to violate never actually fails, it just creates another
      // duplicate row and takes the "success" branch every time. Now uses
      // upsert with ignoreDuplicates so a losing concurrent request becomes
      // a no-op instead of a new row.
      await admin
        .from("founder_context")
        .upsert(
          { user_id: user.id, trial_started_at: trialStartedAt, trial_ends_at: trialEndsAtNew, trial_expired: false },
          { onConflict: "user_id", ignoreDuplicates: true },
        );

      const { data: current } = await admin
        .from("founder_context")
        .select("trial_started_at, trial_ends_at, trial_expired")
        .eq("user_id", user.id)
        .maybeSingle();

      if (current) {
        trialRow = current;
      } else {
        const { data: existing } = await admin
          .from("founder_context")
          .select("trial_started_at, trial_ends_at, trial_expired")
          .eq("user_id", user.id)
          .maybeSingle();
        trialRow = existing;
      }

    }

    const effectiveEndsAt = trialRow?.trial_ends_at;
    if (effectiveEndsAt && Number.isFinite(new Date(effectiveEndsAt).getTime())) {
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

  if (payingSubscriber) {
    trialActive = false;
    trialDaysRemaining = 0;
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
    billingProvider: subscriptionProvider,
    billingStatus: subscriptionStatus,
    currentPeriodEnd: subscriptionPeriodEnd,
    // True when the customer has cancelled but is still inside the period they paid for.
    cancelAtPeriodEnd:
      effectivePlan === "builder" &&
      Boolean(subscriptionCanceledAt) &&
      Boolean(subscriptionPeriodEnd) &&
      new Date(subscriptionPeriodEnd as string).getTime() > Date.now(),
    updatedAt: subscriptionUpdatedAt,
  });
}
