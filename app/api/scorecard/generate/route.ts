/**
 * app/api/scorecard/generate/route.ts
 *
 * POST → generate and persist a Shareable Execution Scorecard (NEW IN V4)
 *
 * Called after Day 7 check-in (or manually). Reads the founder's context,
 * builds the scorecard, persists it, and returns the share payload.
 *
 * Playbook §4.3: "Two days to build. Your first distribution lever that
 * doesn't require you to personally be active on X every day."
 */
/**
 * ⚠️  PLAYBOOK TIMING: Shareable Execution Scorecard
 *
 * This route exists in the codebase ahead of its playbook unlock date.
 * Month 2 — 'After first 7 users' (Playbook §5.3).
 * Do not promote until 7 users have completed Day 7 check-in. Route can stay live but UI entry point should be hidden until then.
 *
 * Current server-side guard: builder (safest interim gate — keeps it off free tier).
 * Do NOT remove the plan guard or surface this feature in UI until the condition above is met.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  generateScorecard,
  buildShareText,
  shouldOfferScorecard,
} from "@/lib/executionScorecard";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const marketGap = String(body?.marketGap ?? "").trim();

  const admin = createAdminClient();

  // ── Pull founder context ──────────────────────────────────────────────────
  const { data: ctx } = await admin
    .from("founder_context")
    .select("startup_summary, current_stage, momentum_score, last_active")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── Count completed tasks ─────────────────────────────────────────────────
  const { count: tasksCompleted } = await admin
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_completed", true)
    ;

  // ── Calculate days active ─────────────────────────────────────────────────
  const { data: profile } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", user.id)
    .maybeSingle();

  const createdAt = profile?.created_at ? new Date(profile.created_at) : new Date();
  const daysActive = Math.max(
    0,
    Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))
  );

  // ── Check if already shared ───────────────────────────────────────────────
  const { data: existingCard } = await admin
    .from("execution_scorecards")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const alreadyShared = !!existingCard;

  // ── Validate trigger conditions ───────────────────────────────────────────
  if (!shouldOfferScorecard(daysActive, tasksCompleted ?? 0, alreadyShared)) {
    return NextResponse.json({
      ok: false,
      error: "Scorecard not yet available. Complete 7 days with at least 3 tasks first.",
    }, { status: 400 });
  }

  // ── Generate scorecard ────────────────────────────────────────────────────
  const scorecard = generateScorecard({
    startupSummary: ctx?.startup_summary ?? "",
    marketGap: marketGap || "Identified via BuildMind Reflexion Strike",
    momentumScore: ctx?.momentum_score ?? 50,
    stage: ctx?.current_stage ?? "Idea",
    daysActive,
    tasksCompleted: tasksCompleted ?? 0,
  });

  const sharePayload = buildShareText(scorecard);

  // ── Persist to DB ─────────────────────────────────────────────────────────
  await admin
    .from("execution_scorecards")
    .insert({
      user_id: user.id,
      startup_category: scorecard.startupCategory,
      market_gap: scorecard.marketGap,
      momentum_score: scorecard.momentumScore,
      stage: scorecard.stage,
      days_active: scorecard.daysActive,
      tasks_completed: scorecard.tasksCompleted,
      share_text: sharePayload.text,
      shared_at: null, // updated when founder actually taps share
      created_at: new Date().toISOString(),
    });

  return NextResponse.json({ ok: true, data: sharePayload });
}

/**
 * PATCH → mark a scorecard as shared (called when founder taps the share button)
 */
export async function PATCH(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  await admin
    .from("execution_scorecards")
    .update({ shared_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("shared_at", null);

  return NextResponse.json({ ok: true });
}
