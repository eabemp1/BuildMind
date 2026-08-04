/**
 * Server-owned user behavior state.
 *
 * This is intentionally key/value JSON so meaningful product behavior can move
 * out of localStorage without needing a new founder_context column every time.
 * localStorage remains only an optimistic/offline cache on the client.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ALLOWED_KEYS = new Set([
  "ai_personality",
  "active_project_id",
  "coach_memory",
  "coach_streak_date",
  "today_action",
  "today_action_cache",
  "checkin_done_date",
  "reflect_done_date",
  "break_streak_date",
  "push_prompted_at",
  "push_prompt_shown",
  "push_banner_dismissed_date",
  "first_seen_at",
  "install_prompt_shown",
  "urgency_dismissed_date",
  // FIX (High #7): achievements_unlocked / achievement_stats removed from
  // this whitelist. Nothing server-side has treated them as authoritative
  // since achievements moved to a real user_achievements table + /api/achievements
  // (server re-verifies each achievement's condition() against
  // getServerAchievementStats() before persisting — see app/api/achievements/route.ts).
  // But lib/achievements.ts's syncAchievementsFromServer() still read these
  // two keys BACK from here and overwrote local storage with them — meaning
  // a single forged PATCH to this endpoint from one device would propagate
  // to every other device/session that ran that sync. Stripping them here
  // closes that; the calls that still write/read them elsewhere become
  // harmless no-ops (filtered out same as any other unrecognized key).
  "notifications",
  "blueprint_uses",
  "competitor_history",
  "reframe_usage",
  "validation_receipts",
  "work_window",
  "last_declared_goal",
  "idle_alerted_date",
  "avoidance_signals",
]);

function isAllowedKey(key: unknown): key is string {
  return typeof key === "string" && ALLOWED_KEYS.has(key);
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const keys = (req.nextUrl.searchParams.get("keys") ?? "")
    .split(",")
    .map(k => k.trim())
    .filter(isAllowedKey);

  if (keys.length === 0) {
    return NextResponse.json({ ok: true, values: {} });
  }

  const admin = createAdminClient();
  const { data, error: dbError } = await admin
    .from("user_behavior_state")
    .select("key, value, updated_at")
    .eq("user_id", user.id)
    .in("key", keys);

  if (dbError) return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });

  const values = Object.fromEntries((data ?? []).map(row => [row.key, row.value]));
  return NextResponse.json({ ok: true, values });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { values?: Record<string, unknown> };
  const incoming = body.values && typeof body.values === "object" ? body.values : {};
  const rows = Object.entries(incoming)
    .filter(([key]) => isAllowedKey(key))
    .map(([key, value]) => ({
      user_id: user.id,
      key,
      value,
      updated_at: new Date().toISOString(),
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, values: {} });
  }

  const admin = createAdminClient();
  const { error: dbError } = await admin
    .from("user_behavior_state")
    .upsert(rows, { onConflict: "user_id,key" });

  if (dbError) return NextResponse.json({ ok: false, error: dbError.message }, { status: 500 });

  return NextResponse.json({ ok: true });
  }
