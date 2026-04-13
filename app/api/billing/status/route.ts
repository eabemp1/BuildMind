import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planFromUserMetadata } from "@/lib/plan";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ ok: false, authenticated: false, plan: "free" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    plan: planFromUserMetadata(user),
    billingProvider: user.user_metadata?.billing_provider ?? null,
    billingStatus: user.user_metadata?.billing_status ?? null,
    updatedAt: user.user_metadata?.billing_updated_at ?? null,
  });
}
