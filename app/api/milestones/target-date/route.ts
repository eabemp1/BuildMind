/**
 * POST /api/milestones/target-date  { milestone_id, target_date }
 * Sets (or clears, with null) a milestone's deadline. Until now nothing in
 * the UI wrote milestones.target_date, so Deadline Recovery could never
 * be graded. The admin client bypasses RLS, so ownership is checked here.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function validateTargetDate(value: unknown, now: Date = new Date()): { ok: true; date: string | null } | { ok: false; error: string } {
  if (value === null) return { ok: true, date: null };
  if (typeof value !== "string" || !DATE_RE.test(value)) return { ok: false, error: "Use a date like 2026-11-30." };
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) return { ok: false, error: "That date doesn't exist." };
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
  if (d.getTime() < today.getTime()) return { ok: false, error: "Pick today or a later date." };
  if (d.getTime() > today.getTime() + 730 * 86_400_000) return { ok: false, error: "Pick a date within two years." };
  return { ok: true, date: value };
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { milestone_id?: string; target_date?: unknown };
  if (!body.milestone_id || typeof body.milestone_id !== "string") {
    return NextResponse.json({ ok: false, error: "milestone_id required" }, { status: 400 });
  }
  const v = validateTargetDate(body.target_date ?? null);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const admin = createAdminClient();
  const { data, error: dbErr } = await admin
    .from("milestones")
    .update({ target_date: v.date })
    .eq("id", body.milestone_id)
    .eq("user_id", user.id)
    .select("id, target_date")
    .maybeSingle();
  if (dbErr) return NextResponse.json({ ok: false, error: "Couldn't save the deadline." }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Milestone not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data });
}
