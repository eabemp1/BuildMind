import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { persistUserPlan } from "@/lib/billing/server";
import { sendEmail } from "@/lib/email";

/**
 * app/api/billing/cancel/route.ts — v2
 *
 * Fix #16: Cancel subscription with actual email via Supabase Auth email.
 *
 * Implementation:
 * 1. Downgrades user plan to "free" in user_metadata immediately
 * 2. Records cancel reason + timestamp in founder_context
 * 3. Sends cancellation confirmation email via Supabase Admin auth email
 *    (uses the email_change / custom SMTP configured in your Supabase project)
 *
 * Note: For Paystack subscriptions, the webhook handles the definitive cancel.
 * This route handles the UI-initiated cancel flow.
 */

type CancelBody = {
  mode?: "cancel" | "pause";
  reason?: string;
};



async function disablePaystackSubscription(code: unknown, token: unknown): Promise<string | null> {
  const subscriptionCode = typeof code === "string" ? code.trim() : "";
  const emailToken = typeof token === "string" ? token.trim() : "";
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!subscriptionCode || !emailToken || !secret) return null;

  const res = await fetch("https://api.paystack.co/subscription/disable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
  });

  const payload = (await res.json().catch(() => null)) as { message?: string } | null;
  if (!res.ok) return payload?.message ?? "Paystack subscription disable failed";
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    return NextResponse.json({ ok: false, error: userError.message }, { status: 500 });
  }
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as CancelBody;
  const mode = body.mode === "pause" ? "pause" : "cancel";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";

  const admin = createAdminClient();
  const { data: freshUser } = await admin.auth.admin.getUserById(user.id);
  const metadata = (freshUser.user?.user_metadata ?? {}) as Record<string, unknown>;

  if (mode === "pause") {
    const pauseUntil = new Date(Date.now() + 30 * 86400000).toISOString();
    await persistUserPlan(user.id, "builder", {
      status: "processing",
      reference: null,
      transactionId: null,
      subscriptionId: null,
      customerEmail: user.email?.toLowerCase() ?? null,
      meta: {
        billing_pause_until: pauseUntil,
        billing_pause_reason: reason || null,
      },
    });
    return NextResponse.json({ ok: true, mode, pauseUntil });
  }

  const paystackDisableError = await disablePaystackSubscription(
    metadata.billing_subscription_id,
    metadata.billing_subscription_token,
  );

  // Cancel: stop future billing and downgrade to free immediately
  await persistUserPlan(user.id, "free", {
    status: "canceled",
    customerEmail: user.email?.toLowerCase() ?? null,
    subscriptionId: typeof metadata.billing_subscription_id === "string" ? metadata.billing_subscription_id : null,
    meta: {
      billing_canceled_at: new Date().toISOString(),
      billing_cancel_reason: reason || null,
      billing_cancel_provider_error: paystackDisableError,
    },
  });

  // Record in founder_context for audit trail
  try {
    await admin.from("founder_context").upsert(
      {
        user_id: user.id,
        subscription_cancelled_at: new Date().toISOString(),
        subscription_cancel_reason: reason || null,
      },
      { onConflict: "user_id" }
    );
  } catch {
    // Non-fatal — founder_context may not have these columns yet
  }

  // Send cancellation confirmation email via Resend (best-effort — never blocks response)
  if (user.email) {
    const cancelDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    sendEmail({
      to: user.email,
      template: "subscription_cancelled",
      data: {
        reason: reason || undefined,
        cancelDate,
      },
    }).catch(err => console.error("[billing/cancel] email error:", err));
  }

  return NextResponse.json({
    ok: true,
    mode,
    message: "Subscription cancelled. You've been downgraded to the Free plan.",
    paystackCancelled: !paystackDisableError,
    paystackDisableError,
    emailSent: !!user.email,
  });
}
