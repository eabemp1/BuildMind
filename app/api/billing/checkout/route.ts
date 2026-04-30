import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";

function expectedAmountPesewas(): number {
  return parseInt(
    process.env.PAYSTACK_AMOUNT_BUILDER ??
      process.env.PAYSTACK_AMOUNT_PESEWAS ??
      "29000",
    10,
  );
}

function appUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  if (!PAYSTACK_SECRET_KEY) {
    return NextResponse.json(
      { error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const plan = body?.plan === "builder" ? "builder" : "builder";
  const baseUrl = appUrl(req);

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
    body: JSON.stringify({
      email: user.email,
      amount: expectedAmountPesewas(),
      currency: "GHS",
      callback_url: `${baseUrl}/upgrade`,
      metadata: { user_id: user.id, plan },
    }),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string };
  };

  if (!res.ok || !payload.status || !payload.data?.authorization_url) {
    return NextResponse.json(
      { error: payload.message ?? "Could not create checkout session" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: payload.data.authorization_url });
}
