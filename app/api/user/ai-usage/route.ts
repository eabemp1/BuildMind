import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectivePlan } from "@/lib/server/plan";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  // Trial-aware plan check — trial users get builder-level unlimited access
  const plan = await getEffectivePlan(user.id);
  if (plan === "builder") {
    return NextResponse.json({ ok: true, plan: "builder", unlimited: true });
  }

  const admin = createAdminClient();
  const d = new Date();
  const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const { data } = await admin
    .from("ai_usage")
    .select("call_count")
    .eq("user_id", user.id)
    .eq("month", month)
    .maybeSingle();

  const used = data?.call_count ?? 0;
  const limit = 30;
  return NextResponse.json({
    ok: true,
    plan: "free",
    used,
    limit,
    remaining: Math.max(0, limit - used),
  });
}
