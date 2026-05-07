import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planFromUserMetadata } from "@/lib/plan";
import { getFreshAuthUser } from "@/lib/server/plan";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return NextResponse.json({ ok: false, authenticated: false, plan: "free" });
  }

  if (!user) {
    return NextResponse.json({ ok: false, authenticated: false, plan: "free" });
  }

  const freshUser = await getFreshAuthUser(user);

  return NextResponse.json({
    ok: true,
    authenticated: true,
    plan: planFromUserMetadata(freshUser),
    billingProvider: freshUser.user_metadata?.billing_provider ?? null,
    billingStatus: freshUser.user_metadata?.billing_status ?? null,
    updatedAt: freshUser.user_metadata?.billing_updated_at ?? null,
  });
}
