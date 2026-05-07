import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFromUserMetadata } from "@/lib/plan";

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

  let freshUser = user;
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createAdminClient();
      const { data } = await admin.auth.admin.getUserById(user.id);
      freshUser = data.user ?? user;
    }
  } catch {
    freshUser = user;
  }

  return NextResponse.json({
    ok: true,
    authenticated: true,
    plan: planFromUserMetadata(freshUser),
    billingProvider: freshUser.user_metadata?.billing_provider ?? null,
    billingStatus: freshUser.user_metadata?.billing_status ?? null,
    updatedAt: freshUser.user_metadata?.billing_updated_at ?? null,
  });
}
