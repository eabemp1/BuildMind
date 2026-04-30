import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistUserPlan } from "@/lib/billing/server";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";

// Expected amount in pesewas (GHS 290 = 29000 pesewas)
function expectedAmountPesewas(): number {
  return parseInt(process.env.PAYSTACK_AMOUNT_PESEWAS ?? "29000", 10);
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
  } | null;
};

type PaystackInitResponse = {
  status: boolean;
  message?: string;
  data?: { authorization_url?: string; access_code?: string; reference?: string } | null;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body?.action ?? "verify");

    // ── INITIALIZE ──────────────────────────────────────────────────────────
    if (action === "initialize") {
      if (!PAYSTACK_SECRET_KEY) {
        return NextResponse.json({ error: "Paystack not configured. Add PAYSTACK_SECRET_KEY to environment variables." }, { status: 503 });
      }

      const email = String(body?.email ?? "").trim();
      const userId = String(body?.userId ?? "").trim();
      const callbackUrl = String(body?.callbackUrl ?? process.env.NEXT_PUBLIC_APP_URL + "/upgrade");

      if (!email || !userId) {
        return NextResponse.json({ error: "email and userId required" }, { status: 400 });
      }

      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
        body: JSON.stringify({
          email,
          amount: expectedAmountPesewas(),
          currency: "GHS",
          callback_url: callbackUrl,
          metadata: { user_id: userId, plan: "builder" },
        }),
      });

      const data = await res.json() as PaystackInitResponse;

      if (!res.ok || !data.status || !data.data?.authorization_url) {
        return NextResponse.json({ error: data.message ?? "Paystack initialization failed" }, { status: 500 });
      }

      return NextResponse.json({ authorization_url: data.data.authorization_url });
    }

    // ── VERIFY ───────────────────────────────────────────────────────────────
    const reference = String(body?.reference ?? "").trim();
    if (!reference) {
      return NextResponse.json({ ok: false, error: "reference is required" }, { status: 400 });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json({ ok: false, error: "Paystack not configured on server" }, { status: 503 });
    }

    // Verify with Paystack API
    const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    const data = await res.json() as PaystackVerifyResponse;

    if (!res.ok || !data.status || data.data?.status !== "success") {
      return NextResponse.json({ ok: false, error: "Payment not successful", details: data.message }, { status: 400 });
    }

    const amount = data.data?.amount ?? 0;
    const expected = expectedAmountPesewas();
    if (amount < expected) {
      return NextResponse.json({ ok: false, error: `Amount mismatch: got ${amount}, expected ${expected}` }, { status: 400 });
    }

    // Get userId from metadata or from Supabase session
    const metaUserId = data.data?.metadata?.user_id as string | undefined;
    let userId = metaUserId;

    if (!userId) {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      userId = user?.id;
    }

    if (!userId) {
      return NextResponse.json({ ok: false, error: "Cannot identify user" }, { status: 401 });
    }

    // Persist plan upgrade to Supabase user_metadata
    await persistUserPlan(userId, "builder", {
      provider: "paystack",
      reference,
      status: "active",
    });

    return NextResponse.json({ ok: true, plan: "builder", reference });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}