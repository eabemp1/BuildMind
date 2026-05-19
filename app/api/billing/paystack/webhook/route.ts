import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { persistUserPlan, resolveUserIdByEmail } from "@/lib/billing/server";
import { sendEmail } from "@/lib/email";
import { logError } from "@/lib/server/logger";
import { createAdminClient } from "@/lib/supabase/admin";

type PaystackEvent = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    status?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string | null } | null;
    metadata?: Record<string, unknown> | null;
    subscription_code?: string | null;
    subscription?: {
      subscription_code?: string | null;
      status?: string | null;
      email_token?: string | null;
      customer?: { email?: string | null } | null;
    } | null;
  } | null;
};

function validateSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

function pickEmail(event: PaystackEvent) {
  return (
    event.data?.customer?.email?.trim().toLowerCase() ??
    event.data?.subscription?.customer?.email?.trim().toLowerCase() ??
    null
  );
}

function pickUserIdFromMetadata(event: PaystackEvent) {
  const meta = event.data?.metadata ?? {};
  const userId = typeof meta.user_id === "string" ? meta.user_id.trim() : "";
  return userId || null;
}

function expectedAmountPesewas(): number {
  return parseInt(
    process.env.PAYSTACK_AMOUNT_BUILDER ??
    process.env.PAYSTACK_AMOUNT_PESEWAS ??
    "44500",
    10,
  );
}

function isValidSuccessfulCharge(event: PaystackEvent): boolean {
  if ((event.data?.status ?? "").toLowerCase() !== "success") return false;
  if ((event.data?.currency ?? "").toUpperCase() !== "GHS") return false;
  return (event.data?.amount ?? 0) >= expectedAmountPesewas();
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_WEBHOOK_SECRET ?? process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "PAYSTACK_WEBHOOK_SECRET (or PAYSTACK_SECRET_KEY fallback) is missing." }, { status: 500 });
  }

  const signature = request.headers.get("x-paystack-signature");
  const rawBody = await request.text();
  if (!validateSignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as PaystackEvent;
  const eventName = event.event?.toLowerCase() ?? "";

  // ── Idempotency guard ─────────────────────────────────────────────────────
  // Store the Paystack event reference before processing to prevent double-upgrades
  // if Paystack fires the same webhook twice (audit §3: billing reconciliation).
  const idempotencyKey = event.data?.reference ?? (event.data?.id != null ? String(event.data.id) : null);
  if (idempotencyKey && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminSupa = createAdminClient();
    // Attempt to insert the idempotency key. If it already exists, the INSERT will
    // fail due to the unique constraint and we return 200 without reprocessing.
    const { error: dupeError } = await adminSupa
      .from("processed_webhooks")
      .insert({ provider: "paystack", event_key: idempotencyKey, event_name: eventName });
    if (dupeError && dupeError.code === "23505") {
      // 23505 = unique_violation — webhook already processed
      return NextResponse.json({ ok: true, ignored: "duplicate_webhook" });
    }
    // Other errors (e.g. table not found) should not block webhook processing
    if (dupeError && dupeError.code !== "42P01") {
      console.warn("[paystack-webhook] idempotency insert failed (non-fatal):", dupeError.message);
    }
  }

  const email = pickEmail(event);
  const userIdFromMetadata = pickUserIdFromMetadata(event);
  const userId = userIdFromMetadata ?? (await resolveUserIdByEmail(email));

  if (!userId) {
    return NextResponse.json({ ok: true, ignored: "No matching user." });
  }

  const reference = event.data?.reference ?? null;
  const transactionId = event.data?.id != null ? String(event.data.id) : null;
  const subscriptionId =
    event.data?.subscription_code ??
    event.data?.subscription?.subscription_code ??
    null;
  const subscriptionToken = event.data?.subscription?.email_token ?? null;

  if (eventName === "charge.success" && !isValidSuccessfulCharge(event)) {
    return NextResponse.json({ ok: true, ignored: "invalid_charge_payload" });
  }

  if (eventName === "charge.success" || eventName === "subscription.create") {
    await persistUserPlan(userId, "builder", {
      provider: "paystack",
      status: "active",
      reference,
      transactionId,
      subscriptionId,
      customerEmail: email,
      meta: {
        billing_interval: subscriptionId ? "monthly" : "unknown",
        billing_subscription_token: subscriptionToken,
      },
    });

    // Send subscription confirmation email (best-effort — never blocks the webhook response)
    if (email) {
      const amountRaw = event.data?.amount ?? 0;
      const currency  = (event.data?.currency ?? "GHS").toUpperCase();
      const amount    = `${currency} ${(amountRaw / 100).toFixed(2)}/month`;
      const date      = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      sendEmail({
        to: email,
        template: "subscription_confirmed",
        data: {
          plan: "Builder",
          amount,
          reference: reference ?? transactionId ?? "—",
          date,
        },
      }).catch(err => logError("billing/webhook/email", err, { route: "/api/billing/paystack/webhook" }));
    }

    return NextResponse.json({ ok: true });
  }

  if (eventName === "subscription.disable" || eventName === "invoice.payment_failed" || eventName === "subscription.not_renew") {
    // Paystack disables/not-renews are treated as access-ending subscription
    // events. The grace timestamp is still recorded for messaging/recovery
    // flows, but the authoritative plan is downgraded immediately.
    const gracePeriodEndsAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    await persistUserPlan(userId, "free", {
      provider: "paystack",
      status: "canceled",
      reference,
      transactionId,
      subscriptionId,
      customerEmail: email,
      meta: {
        grace_period_ends_at: gracePeriodEndsAt,
        grace_reason: eventName,
      },
    });

    // Also write grace_period_ends_at into founder_context so plan checks can use it
    // without an auth admin call
    if (userId && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const adminForGrace = createAdminClient();
      adminForGrace
        .from("founder_context")
        .update({ grace_period_ends_at: gracePeriodEndsAt })
        .eq("user_id", userId)
        .then(() => undefined, () => undefined); // best-effort
    }

    // Send cancellation / payment failure email (best-effort)
    if (email) {
      const cancelDate = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const reason = eventName === "invoice.payment_failed"
        ? "Payment failed — your subscription was not renewed"
        : undefined;
      sendEmail({
        to: email,
        template: "subscription_cancelled",
        data: { cancelDate, reason },
      }).catch(err => logError("billing/webhook/email", err, { route: "/api/billing/paystack/webhook" }));
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: eventName || "unknown_event" });
}
