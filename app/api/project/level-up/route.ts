/**
 * app/api/project/level-up/route.ts
 *
 * POST → called after every Today page check-in and reflection.
 *         Evaluates whether the founder is eligible to review a stage change.
 *
 * FIX (coherence bug): this used to gate eligibility on
 * `execution_score >= threshold` (a column only recomputed once a day, in
 * the morning-briefing cron) and `completed tasks >= flat number` counted
 * across the PROJECT'S ENTIRE HISTORY, not the current stage — so a
 * founder could finish 100% of their current stage's real checklist and
 * still see nothing, while an unrelated cumulative counter decided
 * whether they were "eligible." Score and task volume were also two
 * numbers already documented as "supporting evidence, not a gate"
 * elsewhere in this codebase (see lib/server/stageTransition.ts) — this
 * route was the one place that still used them as the actual gate.
 *
 * Eligibility is now the same real signal every other surface uses —
 * lib/server/stageProgress.ts's computeStageProgress() — so this route,
 * the Today-page progress ring, the Projects-list card, and
 * lib/server/stageTransition.ts's stage-nudge detector can never disagree
 * about whether a stage is actually done. execution_score and lifetime
 * task count are still returned for context, not as gates.
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
    return NextResponse.json({ ok: true, eligible: false });
  }

  const { data: milestones } = await admin
    .from("milestones")
    .select("id, title, status, stage")
    .eq("project_id", project_id)
    .eq("user_id", user.id);

  const stageProgress = computeStageProgress(milestones ?? [], currentStage);

  // Supporting context only — never gates eligibility. Kept in the
  // response because it's still useful to show alongside the real
  // milestone count (e.g. "and your execution score backs it up").
  const { count: lifetimeCompletedTasks } = await admin
    .from("tasks")
    .select("id, milestones!inner(project_id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_completed", true)
    .eq("milestones.project_id", project_id);

  if (stageProgress.isComplete) {
    const newStage = STAGE_ORDER[stageIdx + 1];
    return NextResponse.json({
      ok: true,
      eligible: true,
      current_stage: currentStage,
      next_stage: newStage,
      stage_progress: stageProgress,
      execution_score: project.execution_score ?? 0,
      lifetime_completed_tasks: lifetimeCompletedTasks ?? 0,
      requires_founder_confirmation: true,
    });
  }

  return NextResponse.json({
    ok:            true,
    eligible:      false,
    current_stage: currentStage,
    next_stage:    STAGE_ORDER[stageIdx + 1],
    stage_progress: stageProgress,
    execution_score: project.execution_score ?? 0,
    lifetime_completed_tasks: lifetimeCompletedTasks ?? 0,
  });
}
