/**
 * app/api/founder-memory/route.ts
 *
 * GET  → returns the current user's founder_memory row
 * PATCH → updates specific whitelisted fields on founder_memory
 *
 * Exists separately from /api/founder-context because founder_memory
 * and founder_context are different tables with different concerns:
 *   founder_context  — operational task state (stage, momentum, scores)
 *   founder_memory   — behavioural memory + session state (avoidance zones,
 *                      strengths, personality tags, dismiss flags, etc.)
 *
 * Note: the existing /api/founder-context PATCH route incorrectly listed
 * pending_milestone_break in its whitelist — that column lives here in
 * founder_memory, not founder_context. New dismiss fields (briefing_dismissed_date)
 * are routed through this endpoint from the start.
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
    .from("founder_memory")
    .select("*")
    .eq("user_id", user.id)
    // FIX: founder_memory has no UNIQUE constraint on user_id (confirmed —
    // only `id` is the primary key), while the PATCH handler below upserts
    // with `onConflict: "user_id"`. Without a matching unique index,
    // onConflict has nothing to target, so every PATCH likely inserts a new
    // row instead of updating the existing one — the same root cause
    // already documented elsewhere in this codebase for founder_context's
    // 611-duplicate-row incident. `.maybeSingle()` errors the moment a
    // second row exists, which made this route return 500 — and
    // app/today/page.tsx's dismiss check treats a failed fetch as "not
    // dismissed," so the morning briefing modal kept reappearing. Ordering
    // by most-recently-updated and taking one row tolerates duplicates
    // gracefully instead of hard-failing, independent of whether the
    // underlying duplicate rows get cleaned up.
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dbErr) return NextResponse.json({ ok: false, error: dbErr.message }, { status: 500 });

  // Row doesn't exist yet — return empty data rather than erroring
  return NextResponse.json({ ok: true, data: data ?? null });
}

export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  // Whitelisted fields only — prevents arbitrary column writes.
  // DATE_FIELDS are stored as YYYY-MM-DD strings and validated to that format.
  // TEXT_FIELDS are stored as text, capped at 5 000 chars.
  // JSON_TEXT_FIELDS are text columns that hold serialised JSON (e.g. pending_milestone_break).
  const DATE_FIELDS = new Set([
    "briefing_dismissed_date",
  ]);
  const TEXT_FIELDS = new Set([
    "last_insight",
    "archetype",
    "archetype_classified_at",
    "last_morning_note",
    "last_week_summary",
    "initial_analysis",
  ]);
  const JSON_TEXT_FIELDS = new Set([
    "pending_milestone_break",
  ]);

  const patch: Record<string, unknown> = {};

  for (const key of DATE_FIELDS) {
    if (!(key in body)) continue;
    const val = body[key];
    // Accept null (clears the field) or a YYYY-MM-DD string
    if (val === null) { patch[key] = null; continue; }
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      patch[key] = val;
    }
  }

  for (const key of TEXT_FIELDS) {
    if (!(key in body)) continue;
    const val = body[key];
    patch[key] = val === null ? null : typeof val === "string" ? val.slice(0, 5000) : null;
  }

  for (const key of JSON_TEXT_FIELDS) {
    if (!(key in body)) continue;
    const val = body[key];
    if (val === null) { patch[key] = null; continue; }
    // Accept pre-serialised JSON strings or objects (serialise objects here)
    if (typeof val === "string") { patch[key] = val.slice(0, 10000); continue; }
    if (typeof val === "object") { patch[key] = JSON.stringify(val).slice(0, 10000); continue; }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "No patchable fields provided" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error: upsertErr } = await admin
    .from("founder_memory")
    .upsert({ user_id: user.id, ...patch }, { onConflict: "user_id" });

  if (upsertErr) return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
