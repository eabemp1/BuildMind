import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistUserPlan } from "@/lib/billing/server";

type PaddleVerifyBody = {
  transactionId?: string;
};

type PaddleTransactionResponse = {
  data?: {
    id?: string;
    status?: string;
    customer_id?: string | null;
    custom_data?: Record<string, unknown> | null;
    details?: {
      totals?: {
        total?: string | null;
        currency_code?: string | null;
      } | null;
    } | null;
  } | null;
  error?: { detail?: string }[];
};

export async function POST(request: Request) {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: "PADDLE_API_KEY is missing." }, { status: 500 });
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

  const body = (await request.json().catch(() => ({}))) as PaddleVerifyBody;
  const transactionId = body.transactionId?.trim();
  if (!transactionId) {
    return NextResponse.json({ ok: false, error: "Missing Paddle transaction id." }, { status: 400 });
  }

  const response = await fetch(`https://api.paddle.com/transactions/${encodeURIComponent(transactionId)}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as PaddleTransactionResponse | null;
  if (!response.ok || !payload?.data) {
    return NextResponse.json(
      { ok: false, error: payload?.error?.[0]?.detail ?? "Paddle verification failed." },
      { status: 400 },
    );
  }

  const status = payload.data.status?.toLowerCase() ?? "";
  if (!["completed", "paid"].includes(status)) {
    return NextResponse.json({ ok: false, error: "Transaction is not completed yet." }, { status: 409 });
  }

  await persistUserPlan(user.id, "builder", {
    provider: "paddle",
    status: "active",
    transactionId: payload.data.id ?? transactionId,
    reference: payload.data.id ?? transactionId,
    customerEmail: user.email?.toLowerCase() ?? null,
  });

  return NextResponse.json({ ok: true, plan: "builder" });
}
