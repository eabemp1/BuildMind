import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const { data, error: dbErr } = await admin
    .from("user_achievements")
    .select("achievement_id, unlocked_at")
    .eq("user_id", user.id)
    .order("unlocked_at", { ascending: false });

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id): id is string => typeof id === "string" && id.trim()) : [];
  if (!ids.length) return NextResponse.json({ ok: true, saved: 0 });

  const admin = createAdminClient();
  const rows = ids.map((achievementId) => ({ user_id: user.id, achievement_id: achievementId }));
  const { error: dbErr } = await admin
    .from("user_achievements")
    .upsert(rows, { onConflict: "user_id,achievement_id" });

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, saved: rows.length });
}