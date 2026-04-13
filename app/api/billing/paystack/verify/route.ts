import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistUserPlan } from "@/lib/billing/server";

type PaystackVerifyBody = {
  reference?: string;
};

type PaystackVerifyResponse = {
  status: boolean;
  message?: string;
  data?: {
    id?: number | string;
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    subscription?: number | string | null;
    customer?: { email?: string | null } | null;
    metadata?: Record<string, unknown> | null;
  } | null;
};

function expectedAmount() {
  const raw =
    process.env.PAYSTACK_AMOUNT_BUILDER ??
    process.env.NEXT_PUBLIC_PAYSTACK_AMOUNT_BUILDER ??
    "29000";
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 29000;
}

export async function POST(request: Request) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ ok: false, error: "PAYSTACK_SECRET_KEY is missing." }, { status: 500 });
  }

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

  const body = (await request.json()) as PaystackVerifyBody;
  const reference = body.reference?.trim();
  if (!reference) {
    return NextResponse.json({ ok: false, error: "Missing Paystack reference." }, { status: 400 });
  }

  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as PaystackVerifyResponse | null;
  if (!response.ok || !payload?.status) {
    return NextResponse.json(
      { ok: false, error: payload?.message ?? "Paystack verification failed." },
      { status: 400 },
    );
  }

  const transaction = payload.data;
  const transactionStatus = transaction?.status?.toLowerCase();
  if (transactionStatus !== "success") {
    return NextResponse.json({ ok: false, error: "Payment is not successful yet." }, { status: 409 });
  }

  const paidAmount = Number(transaction?.amount ?? 0);
  if (paidAmount < expectedAmount()) {
    return NextResponse.json({ ok: false, error: "Paid amount does not match the Builder plan." }, { status: 409 });
  }

  const paidEmail = transaction?.customer?.email?.trim().toLowerCase() ?? null;
  const userEmail = user.email?.trim().toLowerCase() ?? null;
  if (paidEmail && userEmail && paidEmail !== userEmail) {
    return NextResponse.json({ ok: false, error: "This payment belongs to a different account." }, { status: 409 });
  }

  await persistUserPlan(user.id, "builder", {
    provider: "paystack",
    status: "active",
    reference,
    transactionId: transaction?.id != null ? String(transaction.id) : null,
    subscriptionId: transaction?.subscription != null ? String(transaction.subscription) : null,
    customerEmail: paidEmail ?? userEmail,
  });

  return NextResponse.json({ ok: true, plan: "builder" });
}
