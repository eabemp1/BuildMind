/**
 * app/api/founder-context/streak/route.ts
 *
 * GET  → returns { streak, lastCheckinDate } from founder_context (authoritative)
 * POST → records a check-in event for TODAY (server's real date) and returns
 *         the new authoritative streak.
 *
 * FIX: previously accepted { streak, lastCheckinDate } directly from the
 * client and only bounds-checked it (0-3650, and — after a first pass this
 * session — also capped to "at most previousStreak+1 per call"). That
 * second constraint narrowed forgery but didn't close it: a script calling
 * this endpoint repeatedly, each time with a different fake lastCheckinDate,
 * could still walk the streak up to the max over many requests. This was
 * also the fourth of four independent, disconnected streak implementations
 * found across the codebase this session (the others: complete_task_atomic,
 * reflect-action's inline logic, and this route's own prior version) — all
 * four now call the same shared, atomic Postgres function. The client can
 * still send a body (kept for backward compatibility with existing
 * callers), but nothing in it is trusted for the computation anymore —
 * only the server's own clock decides what day it is.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin
    .from("founder_context")
    .select("streak, last_checkin_date")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    streak: data?.streak ?? 0,
    lastCheckinDate: data?.last_checkin_date ?? null,
  });
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  // Body is read but deliberately not used for the streak/date computation —
  // kept only so existing callers sending { streak, lastCheckinDate } don't
  // error on an unexpected payload shape. See fix note above.
  await req.json().catch(() => ({}));

  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10); // server's real date, never client-supplied

  const { data: newStreak, error: rpcError } = await admin.rpc("update_streak_atomic", {
    p_user_id: user.id,
    p_project_id: null,
    p_today: today,
  });

  if (rpcError) {
    logError("founder-context/streak", rpcError, { userId: user.id });
    return NextResponse.json({ ok: false, error: "Could not update streak" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, streak: newStreak ?? 0 });
}
