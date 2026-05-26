/**
 * app/api/waitlist/teams/route.ts — Growth Improvement #3
 *
 * Teams waitlist — captures demand for "BuildMind for Teams" before the feature
 * exists. Founders who submit join a waitlist and get an early-access email
 * when teams launches.
 *
 * Captures:
 *   - email (required)
 *   - use_case: "co-founders" | "small_team" | "investor_updates" | "other"
 *   - team_size: number (optional)
 *   - userId (if logged in)
 *
 * No auth required — also collects demand from visitors on the landing page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const schema = z.object({
  email:     z.string().email(),
  use_case:  z.enum(["co-founders", "small_team", "investor_updates", "other"]).optional(),
  team_size: z.number().int().min(1).max(500).optional(),
  userId:    z.string().uuid().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Server config error" }, { status: 500 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message }, { status: 422 });
  }

  const { email, use_case, team_size, userId } = parsed.data;
  const supabase = createClient(supabaseUrl, serviceKey);

  // Idempotent upsert on email — duplicate submissions just update their data
  const { error } = await supabase.from("teams_waitlist").upsert({
    email:        email.toLowerCase(),
    use_case:     use_case ?? "other",
    team_size:    team_size ?? null,
    user_id:      userId ?? null,
    submitted_at: new Date().toISOString(),
  }, { onConflict: "email" });

  if (error) {
    return NextResponse.json({ ok: false, error: "Database error" }, { status: 500 });
  }

  const { count } = await supabase
    .from("teams_waitlist")
    .select("*", { count: "exact", head: true });

  return NextResponse.json({
    ok: true,
    message: "You're on the early access list.",
    position: count ?? undefined,
  });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  // Admin-only: return waitlist count
  const authHeader = req.headers.get("authorization");
  const adminToken = process.env.CRON_SECRET;
  if (!adminToken || authHeader !== `Bearer ${adminToken}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { count } = await supabase.from("teams_waitlist").select("*", { count: "exact", head: true });
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
