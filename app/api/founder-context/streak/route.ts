/**
 * app/api/founder-context/streak/route.ts
 *
 * GET  → returns { streak, lastCheckinDate } from founder_context (authoritative)
 * POST → writes { streak, lastCheckinDate } to founder_context
 *
 * This makes streak device-agnostic. localStorage is still used as a fast
 * local cache, but this endpoint is the source of truth. Called on every
 * incrementDailyStreak() and on every app mount that shows streak.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

  const { streak, lastCheckinDate } = await req.json().catch(() => ({}));
  if (typeof streak !== "number" || !isFinite(streak) || streak < 0) {
    return NextResponse.json({ ok: false, error: "streak must be a non-negative finite number" }, { status: 400 });
  }
  // Cap streak to a reasonable upper bound. A streak of 3650 = ~10 years daily.
  // Values beyond this are almost certainly a bug or abuse attempt.
  const MAX_STREAK = 3650;
  const clampedStreak = Math.min(MAX_STREAK, Math.floor(streak));

  const admin = createAdminClient();
  await admin.from("founder_context").upsert(
    {
      user_id: user.id,
      streak: clampedStreak,
      last_checkin_date: lastCheckinDate ?? new Date().toISOString().split("T")[0],
    },
    { onConflict: "user_id" }
  );

  return NextResponse.json({ ok: true, streak: clampedStreak });
}
