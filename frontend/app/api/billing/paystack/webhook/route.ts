import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { persistUserPlan, resolveUserIdByEmail } from "@/lib/billing/server";

type PaystackEvent = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    status?: string;
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

  console.info("[Billing][Paystack Webhook] Received", {
    eventName,
    email,
    userIdFromMetadata,
    resolvedUserId: userId,
  });

  if (!userId) {
    console.warn("[Billing][Paystack Webhook] No matching user", {
      eventName,
      email,
    });
    return NextResponse.json({ ok: true, ignored: "No matching user." });
  }

  const reference = event.data?.reference ?? null;
  const transactionId = event.data?.id != null ? String(event.data.id) : null;
  const subscriptionId =
    event.data?.subscription_code ??
    event.data?.subscription?.subscription_code ??
    null;

  if (eventName === "charge.success") {
    await persistUserPlan(userId, "builder", {
      provider: "paystack",
      status: "active",
      reference,
      transactionId,
      subscriptionId,
      customerEmail: email,
    });
    console.info("[Billing][Paystack Webhook] Builder activated", { userId, reference });
    return NextResponse.json({ ok: true });
  }

  if (eventName === "subscription.disable" || eventName === "invoice.payment_failed") {
    await persistUserPlan(userId, "free", {
      provider: "paystack",
      status: "canceled",
      reference,
      transactionId,
      subscriptionId,
      customerEmail: email,
    });
    console.info("[Billing][Paystack Webhook] Downgraded to free", { userId, reference, eventName });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: eventName || "unknown_event" });
}
