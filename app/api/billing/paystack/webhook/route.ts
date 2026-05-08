import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { persistUserPlan, resolveUserIdByEmail } from "@/lib/billing/server";

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
    "29000",
    10,
  );
}

function isValidSuccessfulCharge(event: PaystackEvent): boolean {
  if ((event.data?.status ?? "").toLowerCase() !== "success") return false;
  if ((event.data?.currency ?? "").toUpperCase() !== "GHS") return false;
  return (event.data?.amount ?? 0) >= expectedAmountPesewas();
}

export async function POST(request: Request) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY is missing." }, { status: 500 });
  }

  const signature = request.headers.get("x-paystack-signature");
  const rawBody = await request.text();
  if (!validateSignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid webhook signature." }, { status: 401 });
  }

  const event = JSON.parse(rawBody) as PaystackEvent;
  const eventName = event.event?.toLowerCase() ?? "";
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
    return NextResponse.json({ ok: true });
  }

  if (eventName === "subscription.disable" || eventName === "invoice.payment_failed" || eventName === "subscription.not_renew") {
    await persistUserPlan(userId, "free", {
      provider: "paystack",
      status: "canceled",
      reference,
      transactionId,
      subscriptionId,
      customerEmail: email,
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: eventName || "unknown_event" });
}
