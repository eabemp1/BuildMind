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
    .single();

  if (dbErr && dbErr.code === "PGRST116") {
    // Row doesn't exist yet — create it
    const { data: created } = await admin
      .from("founder_context")
      .insert({ user_id: user.id })
      .select()
      .single();
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
  // Whitelist patchable fields
  const ALLOWED = [
    "startup_summary","current_stage","cognitive_load","timezone_offset",
    "morning_briefing_hour","evening_check_hour","topics_mentioned_repeatedly",
    "tasks_completed_today","last_task_date","daily_tasks_reset_at",
    "ai_messages_today","last_ai_date",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const key of ALLOWED) { if (key in body) patch[key] = body[key]; }

  const admin = createAdminClient();
  await admin.from("founder_context").upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });
  return NextResponse.json({ ok: true });
}
