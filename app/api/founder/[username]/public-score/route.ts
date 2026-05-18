/**
 * app/api/founder/[username]/public-score/route.ts — Product Improvement #9
 *
 * Returns a founder's public score card data for /founder/[username].
 * FEATURE FLAG: FEATURES.publicFounderScore must be true to return data.
 * When false, returns 404 — the page is built but the feature is off.
 *
 * Data returned (all voluntarily shared — founder opts in via settings):
 *   - momentum_score (0–100)
 *   - stage
 *   - startup_summary (only if founder has enabled public profile)
 *   - tasks_completed_total
 *   - consecutive_tasks_completed
 *   - display_name, avatar_url (from profiles)
 *   - joined_at
 *
 * No PII is returned. No email, no private notes, no billing data.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { FEATURES } from "@/lib/features";

export const runtime  = "edge";
export const dynamic  = "force-dynamic";

// Cache public scores for 5 minutes — reduces DB reads for shared URLs
export const revalidate = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ username: string }> },
): Promise<NextResponse> {
  // Feature flag — return 404 when not yet activated
  if (!FEATURES.publicFounderScore) {
    return NextResponse.json({ ok: false, error: "Not yet available" }, { status: 404 });
  }

  const { username } = await params;
  if (!username || username.length > 50) {
    return NextResponse.json({ ok: false, error: "Invalid username" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // Resolve username → user_id via profiles table
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id, display_name, avatar_url, username, public_profile, joined_at")
    .eq("username", username.toLowerCase())
    .eq("public_profile", true) // only return if founder opted in
    .maybeSingle();

  if (profileError || !profile) {
    return NextResponse.json({ ok: false, error: "Founder not found or profile is private" }, { status: 404 });
  }

  // Fetch founder_context (momentum + stage)
  const { data: ctx } = await supabase
    .from("founder_context")
    .select("momentum_score, stage, startup_summary, tasks_completed_total, consecutive_tasks_completed")
    .eq("user_id", profile.user_id)
    .maybeSingle();

  const score = {
    displayName:                profile.display_name ?? username,
    avatarUrl:                  profile.avatar_url   ?? null,
    username:                   profile.username,
    joinedAt:                   profile.joined_at,
    momentumScore:              ctx?.momentum_score              ?? 50,
    stage:                      ctx?.stage                       ?? "Building",
    startupSummary:             ctx?.startup_summary             ?? null,
    tasksCompletedTotal:        ctx?.tasks_completed_total       ?? 0,
    consecutiveTasksCompleted:  ctx?.consecutive_tasks_completed ?? 0,
  };

  return NextResponse.json({ ok: true, score });
}
