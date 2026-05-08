import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistUserPlan } from "@/lib/billing/server";
import { getClientIp, rateLimit } from "@/lib/server/rateLimit";

// Expected amount in pesewas (GHS 290 = 29000 pesewas)
function expectedAmountPesewas(): number {
  return parseInt(
    process.env.PAYSTACK_AMOUNT_BUILDER ??
    process.env.PAYSTACK_AMOUNT_PESEWAS ??
    "29000",
    10,
  );
}

type PaystackVerifyResponse = {
  status: boolean;
  message?: string;
  data?: {
    status?: string;
    reference?: string;
    amount?: number;
    currency?: string;
    customer?: { email?: string | null } | null;
    metadata?: Record<string, unknown> | null;
    subscription_code?: string | null;
    subscription?: {
      plan?: { plan_code?: string | null } | null;
      subscription_code?: string | null;
      email_token?: string | null;
    } | null;
  } | null;
};

export async function POST(req: NextRequest) {
  try {
    const limit = rateLimit(`paystack-verify:${getClientIp(req)}`, 20, 15 * 60 * 1000);
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: "Too many verification attempts. Try again shortly." },
        { status: 429 },
      );
    }

    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const reference = String(body?.reference ?? "").trim();
    if (!reference) {
      return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
    }

    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
    if (!paystackSecretKey) {
      return NextResponse.json({ ok: false, error: "Paystack not configured on server" }, { status: 503 });
    }

    // Verify with Paystack API
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${paystackSecretKey}` },
    });

    const data = await res.json() as PaystackVerifyResponse;

    if (!res.ok || !data.status || data.data?.status !== "success") {
      return NextResponse.json({ ok: false, error: "Payment not successful", details: data.message }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user?.id || !user.email) {
      return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
    }

    const amount = data.data?.amount ?? 0;
    const expected = expectedAmountPesewas();
    if (amount < expected) {
      return NextResponse.json({ ok: false, error: `Amount mismatch: got ${amount}, expected ${expected}` }, { status: 400 });
    }

    if (data.data?.currency !== "GHS") {
      return NextResponse.json({ ok: false, error: "Currency mismatch" }, { status: 400 });
    }

    const metaUserId = typeof data.data?.metadata?.user_id === "string"
      ? data.data.metadata.user_id.trim()
      : "";
    if (metaUserId && metaUserId !== user.id) {
      return NextResponse.json({ ok: false, error: "Payment user mismatch" }, { status: 403 });
    }

    const customerEmail = data.data?.customer?.email?.trim().toLowerCase() ?? "";
    if (customerEmail && customerEmail !== user.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Payment email mismatch" }, { status: 403 });
    }

    const expectedPlanCode = process.env.PAYSTACK_BUILDER_PLAN_CODE?.trim();
    const actualPlanCode = data.data?.subscription?.plan?.plan_code?.trim();
    if (expectedPlanCode && actualPlanCode && actualPlanCode !== expectedPlanCode) {
      return NextResponse.json({ ok: false, error: "Plan code mismatch" }, { status: 400 });
    }

    // Persist plan upgrade to Supabase user_metadata
    await persistUserPlan(user.id, "builder", {
      provider: "paystack",
      reference,
      status: "active",
      subscriptionId: data.data?.subscription_code ?? data.data?.subscription?.subscription_code ?? null,
      customerEmail: customerEmail || user.email,
      meta: {
        billing_interval: "monthly",
        billing_subscription_token: data.data?.subscription?.email_token ?? null,
      },
    });

    return NextResponse.json({ ok: true, plan: "builder", reference });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
