import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planFromUserMetadata, TRIAL_DURATION_DAYS } from "@/lib/plan";
import { getFreshAuthUser } from "@/lib/server/plan";
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

  // ── 7-Day Free Trial: read from founder_context (server-authoritative) ────
  let trialActive = false;
  let trialExpired = false;
  let trialDaysRemaining = 0;
  let trialEndsAt: string | null = null;

  try {
    const admin = createAdminClient();
    const { data: ctx } = await admin
      .from("founder_context")
      .select("trial_started_at, trial_ends_at, trial_expired")
      .eq("user_id", user.id)
      .maybeSingle();

    if (ctx?.trial_ends_at) {
      trialEndsAt = ctx.trial_ends_at;
      const now = new Date();
      const ends = new Date(ctx.trial_ends_at);

      if (ctx.trial_expired || ends <= now) {
        // Trial has expired — enforce hard paywall
        trialExpired = true;
        if (!ctx.trial_expired) {
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

  // Effective plan: trial grants builder; expired trial hard-gates back to free
  const effectivePlan = basePlan === "builder"
    ? "builder"
    : trialActive
      ? "builder"
      : "free";

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
    billingProvider: freshUser.user_metadata?.billing_provider ?? null,
    billingStatus: freshUser.user_metadata?.billing_status ?? null,
    updatedAt: freshUser.user_metadata?.billing_updated_at ?? null,
  });
}
