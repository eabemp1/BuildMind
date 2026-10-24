/**
 * app/api/today/quiet-day/route.ts — let a founder rest one day without losing the streak.
 *
 * GET  → { today, quietDays, quietToday, canTakeToday, canTakeTomorrow, nextAllowed }
 * POST → body { day: "today" | "tomorrow" }. Rules live in lib/quietDays.ts (one in any 7 days, today or
 *        tomorrow only). The date is the server's own UTC date; nothing date-like is trusted from the client.
 *
 * Needs migration 20261024000000_quiet_days.sql. Without it the route says so plainly instead of failing.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { rateLimitAsync } from "@/lib/server/rateLimit";
import { streakDayKey } from "@/lib/streak";
import { addQuietDay, canTakeQuietDay, dayKeyFrom, isQuietDay, normalizeQuietDays, QUIET_REASON_TEXT } from "@/lib/quietDays";

function tomorrowOf(today: string): string {
  const t = Date.parse(`${today}T00:00:00Z`);
  return dayKeyFrom(Math.floor(t / 86_400_000) + 1);
}

async function load(userId: string): Promise<{ days: string[]; missingColumn: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("founder_context").select("quiet_days").eq("user_id", userId).maybeSingle();
  if (error) {
    if (/quiet_days|column/i.test(error.message ?? "")) return { days: [], missingColumn: true };
    throw error;
  }
  return { days: normalizeQuietDays(data?.quiet_days, streakDayKey()), missingColumn: false };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });
    const today = streakDayKey();
    const tomorrow = tomorrowOf(today);
    const { days, missingColumn } = await load(user.id);
    const todayCheck = canTakeQuietDay(days, today, today);
    const tomorrowCheck = canTakeQuietDay(days, tomorrow, today);
    const next = !todayCheck.ok && todayCheck.nextAllowed ? todayCheck.nextAllowed : null;
    return NextResponse.json({
      ok: true,
      available: !missingColumn,
      today,
      quietDays: days,
      quietToday: isQuietDay(days, today),
      canTakeToday: !missingColumn && todayCheck.ok,
      canTakeTomorrow: !missingColumn && tomorrowCheck.ok,
      nextAllowed: next,
    });
  } catch (err) {
    logError("today/quiet-day/get", err);
    return NextResponse.json({ ok: false, error: "Could not load quiet days." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });
    const limit = await rateLimitAsync(`quiet-day:${user.id}`, 20, 60 * 60 * 1000);
    if (!limit.ok) return NextResponse.json({ ok: false, error: "Too many requests. Try again later." }, { status: 429 });

    const body = await req.json().catch(() => ({}));
    const which = body?.day === "tomorrow" ? "tomorrow" : "today";
    const today = streakDayKey();
    const target = which === "tomorrow" ? tomorrowOf(today) : today;

    const { days, missingColumn } = await load(user.id);
    if (missingColumn) return NextResponse.json({ ok: false, error: "Quiet days are not switched on yet." }, { status: 503 });
    const check = canTakeQuietDay(days, target, today);
    if (!check.ok) {
      return NextResponse.json({ ok: false, reason: check.reason, error: QUIET_REASON_TEXT[check.reason] ?? "Not available.", nextAllowed: check.nextAllowed ?? null }, { status: 409 });
    }
    const next = addQuietDay(days, target, today);
    const admin = createAdminClient();
    // The row may not exist for a brand-new founder; upsert keeps the call safe.
    const { error: upErr } = await admin.from("founder_context").upsert({ user_id: user.id, quiet_days: next }, { onConflict: "user_id" });
    if (upErr) throw upErr;
    return NextResponse.json({ ok: true, day: target, quietDays: next });
  } catch (err) {
    logError("today/quiet-day/post", err);
    return NextResponse.json({ ok: false, error: "Could not save the quiet day." }, { status: 500 });
  }
}
