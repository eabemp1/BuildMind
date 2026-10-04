import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearScheduledCancellation,
  getSubscriptionSnapshot,
  persistUserPlan,
  scheduleCancellation,
} from "@/lib/billing/server";
import { formatAccessDate } from "@/lib/billing/cancellation";
import { getPolarClient } from "@/lib/billing/polar";
import { sendEmail } from "@/lib/email";

/**
 * app/api/billing/cancel/route.ts — v3 (fair cancellation)
 *
 * Principles:
 *  1. Cancelling stops the NEXT charge. It never takes away time already paid
 *     for: Builder stays until the current period ends.
 *  2. Billing is stopped at the provider first. If that call fails we change
 *     nothing and say so, so nobody believes they're cancelled while still
 *     being charged.
 *  3. A cancellation can be undone ("resume") until the period ends.
 */

type CancelBody = {
  mode?: "cancel" | "pause" | "resume";
  reason?: string;
};

async function paystackSubscriptionCall(
  action: "disable" | "enable",
  code: unknown,
  token: unknown,
): Promise<{ attempted: boolean; error: string | null }> {
  const subscriptionCode = typeof code === "string" ? code.trim() : "";
  const emailToken = typeof token === "string" ? token.trim() : "";
  const secret = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!subscriptionCode || !emailToken || !secret) return { attempted: false, error: null };

  try {
    const res = await fetch(`https://api.paystack.co/subscription/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ code: subscriptionCode, token: emailToken }),
    });
    const payload = (await res.json().catch(() => null)) as { message?: string } | null;
    if (!res.ok) return { attempted: true, error: payload?.message ?? `Paystack ${action} failed` };
    return { attempted: true, error: null };
  } catch (err) {
    return { attempted: true, error: err instanceof Error ? err.message : `Paystack ${action} failed` };
  }
}

async function polarCancelAtPeriodEnd(subscriptionId: string, cancel: boolean): Promise<string | null> {
  try {
    const polar = getPolarClient();
    await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: { cancelAtPeriodEnd: cancel },
    });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : "Polar update failed";
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) return NextResponse.json({ ok: false, error: userError.message }, { status: 500 });
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as CancelBody;
  const mode = body.mode === "pause" ? "pause" : body.mode === "resume" ? "resume" : "cancel";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 240) : "";

  const admin = createAdminClient();
  const { data: freshUser } = await admin.auth.admin.getUserById(user.id);
  const metadata = (freshUser.user?.user_metadata ?? {}) as Record<string, unknown>;
  const snap = await getSubscriptionSnapshot(user.id);
  const provider = snap?.provider ?? (typeof metadata.billing_provider === "string" ? metadata.billing_provider : null);
  const subscriptionCode = snap?.providerSubscriptionId ?? metadata.billing_subscription_id;
  const emailToken = metadata.billing_subscription_token;

  if (mode === "pause") {
    const pauseUntil = new Date(Date.now() + 30 * 86400000).toISOString();
    await persistUserPlan(user.id, "builder", {
      status: "processing",
      reference: null,
      transactionId: null,
      subscriptionId: null,
      customerEmail: user.email?.toLowerCase() ?? null,
      meta: { billing_pause_until: pauseUntil, billing_pause_reason: reason || null },
    });
    return NextResponse.json({ ok: true, mode, pauseUntil });
  }

  if (mode === "resume") {
    if (provider === "polar" && typeof subscriptionCode === "string" && subscriptionCode) {
      const err = await polarCancelAtPeriodEnd(subscriptionCode, false);
      if (err) {
        return NextResponse.json(
          { ok: false, error: "We couldn't restart your subscription with the payment provider. Nothing was changed. Please try again." },
          { status: 502 },
        );
      }
    } else {
      const res = await paystackSubscriptionCall("enable", subscriptionCode, emailToken);
      if (res.error) {
        return NextResponse.json(
          { ok: false, error: "We couldn't restart your subscription with the payment provider. Nothing was changed. Please try again." },
          { status: 502 },
        );
      }
    }
    const resumed = await clearScheduledCancellation(user.id);
    if (!resumed) {
      return NextResponse.json(
        { ok: false, error: "Your paid period has already ended. Choose Builder again to restart." },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true, mode, message: "Welcome back. Your subscription will renew as normal." });
  }

  // ── Cancel ────────────────────────────────────────────────────────────────
  // Stop billing at the provider first; if that fails, change nothing.
  let providerNote: string | null = null;
  if (provider === "polar" && typeof subscriptionCode === "string" && subscriptionCode) {
    const err = await polarCancelAtPeriodEnd(subscriptionCode, true);
    if (err) {
      return NextResponse.json(
        { ok: false, error: "We couldn't stop your billing with the payment provider, so nothing was cancelled and you won't lose access. Please try again in a moment." },
        { status: 502 },
      );
    }
  } else {
    const res = await paystackSubscriptionCall("disable", subscriptionCode, emailToken);
    if (res.error) {
      return NextResponse.json(
        { ok: false, error: "We couldn't stop your billing with the payment provider, so nothing was cancelled and you won't lose access. Please try again in a moment." },
        { status: 502 },
      );
    }
    if (!res.attempted) {
      providerNote = "We have no recurring-billing record to stop automatically. If you were charged again, contact support and we'll refund it.";
    }
  }

  const { decision } = await scheduleCancellation(user.id, {
    reason: reason || null,
    email: user.email?.toLowerCase() ?? null,
  });

  try {
    await admin.from("founder_context").upsert(
      {
        user_id: user.id,
        subscription_cancelled_at: new Date().toISOString(),
        subscription_cancel_reason: reason || null,
      },
      { onConflict: "user_id" },
    );
  } catch {
    // Non-fatal — columns may not exist yet
  }

  const accessUntil = decision.mode === "until_period_end" ? decision.accessUntil : null;

  if (user.email) {
    sendEmail({
      to: user.email,
      template: "subscription_cancelled",
      data: {
        reason: reason || undefined,
        cancelDate: formatAccessDate(new Date().toISOString()),
        accessUntil: accessUntil ? formatAccessDate(accessUntil) : undefined,
      },
    }).catch(err => console.error("[billing/cancel] email error:", err));
  }

  const message = accessUntil
    ? `Cancelled. You won't be charged again, and Builder stays active until ${formatAccessDate(accessUntil)}.`
    : "Cancelled. You won't be charged again.";

  return NextResponse.json({
    ok: true,
    mode,
    message,
    accessUntil,
    providerNote,
    emailSent: !!user.email,
  });
}
