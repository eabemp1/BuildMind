import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";

function computeMomentum(activity: { completed_at: string }[]): number {
  if (!activity.length) return 0;
  const now = Date.now();
  let score = 0;
  for (const a of activity) {
    const daysAgo = (now - new Date(a.completed_at).getTime()) / 86_400_000;
    const weight = Math.exp(-daysAgo / 8);
    score += weight * 14;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: promoters } = await admin
    .from("promoters")
    .select("id, name, access_token, created_at")
    .order("created_at", { ascending: false });

  const rows = promoters ?? [];

  const results = await Promise.all(
    rows.map(async (p) => {
      const { data: activity } = await admin
        .from("promoter_activity")
        .select("completed_at")
        .eq("promoter_id", p.id)
        .order("completed_at", { ascending: false })
        .limit(200);

      const { count: conversionCount } = await admin
        .from("promoter_conversions")
        .select("*", { count: "exact", head: true })
        .eq("promoter_id", p.id);

      const acts = activity ?? [];
      return {
        name: p.name,
        url: `/promote/${p.access_token}`,
        createdAt: p.created_at,
        momentum: computeMomentum(acts),
        totalLogged: acts.length,
        conversions: conversionCount ?? 0,
        lastActive: acts[0]?.completed_at ?? null,
      };
    }),
  );

  return NextResponse.json({ ok: true, promoters: results });
}
