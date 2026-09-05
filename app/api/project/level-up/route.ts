/**
 * app/api/project/level-up/route.ts
 *
 * POST → called after every Today page check-in, and on demand from the
 *         Projects-page "Check stage readiness" button.
 *         Evaluates whether the founder is ready to review a stage change.
 *
 * FIX (coherence bug, first pass): this used to gate eligibility on
 * `execution_score >= threshold` (a column only recomputed once a day, in
 * the morning-briefing cron) and `completed tasks >= flat number` counted
 * across the PROJECT'S ENTIRE HISTORY, not the current stage. Rewritten to
 * use lib/server/stageProgress.ts's real, stage-scoped milestone count.
 *
 * FIX (product gap, second pass): stage-milestone completion alone was
 * then treated as "eligible" — which meant a founder who finished every
 * task with zero real evidence and a string of low-confidence reflections
 * got the exact same green "eligible" response as a founder who'd actually
 * proven something changed. This route now calls the same
 * lib/server/stageReadiness.ts composite lib/server/stageTransition.ts
 * uses — milestones + typed evidence + reflection conviction merged into
 * one 3-tier answer (not_ready / checklist_only / ready) — so this button
 * and Today's banner can never tell two different stories about the same
 * founder's readiness.
 *
 * `eligible` is kept as a boolean for backward compatibility with existing
 * callers (true whenever tier is "checklist_only" or "ready" — milestones
 * complete is enough to surface something) but the real signal is now
 * `tier` and `readiness`, which callers should prefer.
 *
 * This endpoint still deliberately does not mutate startup_stage. Stage
 * is an operating-mode decision, not a gamified counter. The
 * Projects-page picker (with its evidence review) is the explicit
 * founder-confirmation path and runs the transition lifecycle.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER } from "@/lib/stages";
import { computeStageProgress } from "@/lib/server/stageProgress";
import { computeStageReadiness } from "@/lib/server/stageReadiness";
import type { StageEvidenceType } from "@/lib/server/stageEvidence";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { project_id?: string };

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 });

  const admin = createAdminClient();

  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, startup_stage, execution_score")
    .eq("id", project_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (projErr || !project) {
    return NextResponse.json({ ok: false, eligible: false });
  }

  const currentStage = (project.startup_stage ?? "Idea") as string;
  const stageIdx     = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);

  // Already at max stage or unknown stage
  if (stageIdx < 0 || stageIdx >= STAGE_ORDER.length - 1) {
    return NextResponse.json({ ok: true, eligible: false, tier: "not_ready" });
  }

  const nextStage = STAGE_ORDER[stageIdx + 1];

  const [{ data: milestones }, { data: tasks }, { data: evidenceRows }, { data: reflections }, { count: overrideCount }, { count: lifetimeCompletedTasks }] = await Promise.all([
    admin.from("milestones").select("id, title, status, stage").eq("project_id", project_id).eq("user_id", user.id),
    admin.from("tasks").select("milestone_id, is_completed, milestones!inner(project_id)").eq("milestones.project_id", project_id),
    admin.from("project_stage_evidence").select("evidence_type").eq("project_id", project_id).eq("user_id", user.id).eq("from_stage", currentStage).eq("to_stage", nextStage),
    admin.from("reflections").select("confidence, outcome").eq("user_id", user.id).gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).order("created_at", { ascending: false }).limit(10),
    admin.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", user.id).in("outcome", ["skipped", "overridden", "blocked"]).gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    // Supporting context only — never gates readiness. Kept in the
    // response because it's still useful to show alongside the real
    // milestone count (e.g. "and your execution score backs it up").
    admin.from("tasks").select("id, milestones!inner(project_id)", { count: "exact", head: true }).eq("user_id", user.id).eq("is_completed", true).eq("milestones.project_id", project_id),
  ]);

  const stageProgress = computeStageProgress(milestones ?? [], currentStage, tasks ?? []);

  const reflectionCount = (reflections ?? []).length;
  const avgConfidence = reflectionCount > 0
    ? Math.round(((reflections ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / reflectionCount) * 10) / 10
    : null;

  const readiness = computeStageReadiness({
    stageProgress,
    nextStage,
    evidenceRows: (evidenceRows ?? []) as { evidence_type: StageEvidenceType }[],
    reflectionCount,
    avgConfidence,
    overrides: overrideCount ?? 0,
  });

  return NextResponse.json({
    ok: true,
    eligible: readiness.tier !== "not_ready",
    tier: readiness.tier,
    current_stage: currentStage,
    next_stage: nextStage,
    stage_progress: stageProgress,
    readiness,
    execution_score: project.execution_score ?? 0,
    lifetime_completed_tasks: lifetimeCompletedTasks ?? 0,
    requires_founder_confirmation: true,
  });
}
