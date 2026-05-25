/**
 * app/api/achievements/route.ts
 *
 * GET  — returns all unlocked achievements for the current user with timestamps
 * POST — unlocks one or more achievements and writes them to the DB
 *
 * Table: user_achievements (user_id, achievement_id, unlocked_at)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ids: (data ?? []).map((r) => r.achievement_id),
      records: data ?? [], // includes unlocked_at for display
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "achievements GET failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "ids array required" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Upsert all achievements — ignore conflicts (already unlocked)
    const rows = ids.map((achievement_id) => ({
      user_id: userId,
      achievement_id,
      unlocked_at: new Date().toISOString(),
    }));

    const { error } = await supabase
      .from("user_achievements")
      .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, unlocked: ids.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "achievements POST failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
