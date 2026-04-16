import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistUserPlan } from "@/lib/billing/server";

type CancelBody = {
  mode?: "cancel" | "pause";
  reason?: string;
};

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

  console.info("[Billing][Cancel] Request", {
    userId: user.id,
    mode,
    hasReason: Boolean(reason),
  });

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
    console.info("[Billing][Cancel] Plan paused", { userId: user.id, pauseUntil });
    return NextResponse.json({ ok: true, mode, pauseUntil });
  }

  await persistUserPlan(user.id, "free", {
    status: "canceled",
    customerEmail: user.email?.toLowerCase() ?? null,
    meta: {
      billing_canceled_at: new Date().toISOString(),
      billing_cancel_reason: reason || null,
    },
  });

  console.info("[Billing][Cancel] Plan canceled", { userId: user.id });

  return NextResponse.json({ ok: true, mode });
}
