/**
 * app/api/recovery-mode/route.ts
 *
 * GET  → check if this founder should be in Recovery Mode
 * POST → generate a Reset Mission and activate Recovery Mode
 * PATCH → mark the Reset Mission as complete, resume normal mode
 *
 * NEW IN V4: Forgiveness Protocol (Playbook §4.2)
 * Fixes guilt churn — the #1 retention killer.
 *
 * Triggered by the Evening Check when Momentum Score has decayed
 * for 3+ consecutive days.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  shouldActivateRecoveryMode,
  getRecoveryModeMessage,
  generateResetMission,
} from "@/lib/recoveryMode";
import type { ReflexionContext } from "@/lib/reflexion";
import { logError } from "@/lib/server/logger";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score, days_inactive, recovery_mode_active, reset_mission_complete")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ctx) {
    return NextResponse.json({ ok: true, recoveryActive: false });
  }

  return NextResponse.json({
    ok: true,
    recoveryActive: ctx.recovery_mode_active ?? false,
    resetMissionComplete: ctx.reset_mission_complete ?? false,
    daysInactive: ctx.days_inactive ?? 0,
    momentumScore: ctx.momentum_score ?? 50,
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Recovery Mode is a Builder-only feature (trial users get full access)
  const { getEffectivePlan } = await import("@/lib/server/plan");
  const userPlan = await getEffectivePlan(user.id);
  if (userPlan !== "builder") {
    return NextResponse.json({ ok: false, error: "Builder plan required", upgradeUrl: "/upgrade" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: ctx } = await admin
    .from("founder_context")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ctx) {
    return NextResponse.json({ ok: false, error: "Context not found" }, { status: 404 });
  }

  // ── Check if Recovery Mode should activate ────────────────────────────────
  const previousScore = (ctx.momentum_score ?? 50) + 4; // approximate previous
  const shouldActivate = shouldActivateRecoveryMode(
    ctx.days_inactive ?? 0,
    ctx.momentum_score ?? 50,
    previousScore
  );

  if (!shouldActivate && !ctx.recovery_mode_active) {
    return NextResponse.json({
      ok: false,
      error: "Recovery Mode conditions not met. Momentum decay < 3 days.",
    }, { status: 400 });
  }

  // ── Build Reflexion context for Reset Mission generation ──────────────────
  const reflexionCtx: ReflexionContext = {
    startupSummary: ctx.startup_summary ?? "",
    stage: ctx.current_stage ?? "Idea",
    momentumScore: ctx.momentum_score ?? 50,
    avoidanceSignals: ctx.avoidance_zones ?? [],
    overrideReasons: ctx.override_reasons ?? [],
    topicsRepeated: ctx.topics_mentioned_repeatedly ?? [],
    cognitiveLoad: ctx.cognitive_load ?? "drained",
    daysInactive: ctx.days_inactive ?? 3,
  };

  // ── Generate the Reset Mission ────────────────────────────────────────────
  const resetMission = await generateResetMission(reflexionCtx);

  // ── Activate Recovery Mode and persist Reset Mission ─────────────────────
  await admin
    .from("founder_context")
    .update({
      recovery_mode_active: true,
      reset_mission_complete: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    recoveryActive: true,
    message: getRecoveryModeMessage(),
    resetMission,
  });
}

export async function PATCH(req: Request) {
  // Mark Reset Mission as complete and resume normal mode
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const admin = createAdminClient();
  const { projectId = null } = await req.json().catch(() => ({}));

  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score")
    .eq("user_id", user.id)
    .maybeSingle();
  const currentScore = ctx?.momentum_score ?? 50;

  // FIX (audit finding, High severity): this was a SIXTH independent,
  // disconnected momentum writer found this session — read-then-write with
  // no lock (a real race risk) and no projects-table mirror, meaning a
  // Reset Mission completion wouldn't show up on mirror-reading pages. The
  // flat "+4" delta is deliberately different from every other path's EMA
  // signal model (see lib/recoveryMode.ts's own comment: "meaningful but
  // not full task credit") — bump_momentum_atomic preserves that exact
  // design while closing both the race and the missing mirror. See
  // supabase/migrations for bump_momentum_atomic.
  const { data: newScore, error: momentumErr } = await admin.rpc("bump_momentum_atomic", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_delta: 4,
  });
  if (momentumErr) {
    logError("recovery-mode/momentum", momentumErr, { userId: user.id });
  }
  const resolvedScore = newScore ?? currentScore;

  await admin
    .from("founder_context")
    .update({
      recovery_mode_active: false,
      reset_mission_complete: true,
      days_inactive: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    message: "Reset Mission complete. Full mode resumes tomorrow morning.",
    momentumScore: resolvedScore,
    momentumDelta: resolvedScore - currentScore,
  });
}
