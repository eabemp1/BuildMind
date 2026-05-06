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

  if (process.env.RESEND_API_KEY && user.email) {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "BuildMind <noreply@buildmind.live>",
        to: user.email,
        subject: "Your BuildMind subscription has been cancelled",
        html: `<p>Hi,</p><p>Your Builder plan has been cancelled. You still have access to all your project data.</p><p>We're sorry to see you go. If you'd like to share why, reply to this email.</p><p>The BuildMind team</p>`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, mode });
}
