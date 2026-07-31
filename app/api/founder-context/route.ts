/**
 * app/api/founder-context/route.ts
 * GET  → returns the current user's Founder Context Object
 * PATCH → updates specific fields
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const { data, error: dbErr } = await admin
    .from("founder_context")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (dbErr && dbErr.code === "PGRST116") {
    // FIX: previously a plain .insert() here — if two requests for the same
    // user raced (multiple tabs, rapid navigation), both could see "no row
    // yet" and both insert, creating a duplicate. With no unique constraint
    // on user_id (a separate bug, now fixed at the schema level), nothing
    // stopped this from compounding — one heavily-testing account ended up
    // with 611 duplicate rows over two months. ignoreDuplicates:true makes
    // this safe now that the constraint exists: if a concurrent request won
    // the race, this becomes a no-op instead of a second row.
    await admin
      .from("founder_context")
      .upsert({ user_id: user.id }, { onConflict: "user_id", ignoreDuplicates: true });

    const { data: created } = await admin
      .from("founder_context")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();
    return NextResponse.json({ ok: true, data: created });
  }
  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, data });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Whitelist patchable fields with type coercion — prevents wrong Postgres types
  // that cause silent upsert failures (e.g. momentum_score: "hello" → NaN).
  const STRING_FIELDS = new Set([
    "startup_summary","current_stage","cognitive_load","timezone_offset",
    "last_task_date","daily_tasks_reset_at","last_ai_date",
    "momentum_updated_at","last_active","last_insight",
  ]);
  const NUMBER_FIELDS = new Set([
    "morning_briefing_hour","evening_check_hour","tasks_completed_today",
    "ai_messages_today","momentum_score","days_inactive",
    "consecutive_tasks_completed","tasks_accepted_this_week","tasks_overridden_this_week",
  ]);
  const BOOL_FIELDS = new Set<string>([]); // pending_milestone_break removed — belongs to founder_memory (see /api/founder-memory), not founder_context; confirmed unused here via repo-wide grep
  const ARRAY_FIELDS = new Set(["topics_mentioned_repeatedly","override_reasons"]);

  const patch: Record<string, unknown> = {};
  for (const key of [...STRING_FIELDS, ...NUMBER_FIELDS, ...BOOL_FIELDS, ...ARRAY_FIELDS]) {
    if (!(key in body)) continue;
    const val = body[key];
    if (STRING_FIELDS.has(key))  { patch[key] = typeof val === "string" ? val.slice(0, 5000) : null; continue; }
    if (NUMBER_FIELDS.has(key))  { const n = Number(val); patch[key] = isFinite(n) ? n : null; continue; }
    if (BOOL_FIELDS.has(key))    { patch[key] = Boolean(val); continue; }
    if (ARRAY_FIELDS.has(key))   { patch[key] = Array.isArray(val) ? val.map(String).slice(0, 50) : null; continue; }
  }

  const admin = createAdminClient();
  await admin.from("founder_context").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}
