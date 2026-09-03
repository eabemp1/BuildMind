/**
 * app/api/project/level-up/route.ts
 *
 * POST → called after every Today page check-in.
 *         Evaluates whether the founder is eligible to review a stage change.
 *
 * Level-up criteria (all must be met):
 *  - execution_score >= LEVEL_THRESHOLD for this stage
 *  - completed project tasks >= TASKS_REQUIRED for this stage
 *  - last_level_up_at is either null or > 7 days ago (prevents instant re-promotion)
 *
 * This endpoint deliberately does not mutate startup_stage. Stage is an
 * operating-mode decision, not a gamified counter. The Projects-page picker
 * is the explicit founder-confirmation path and runs the transition lifecycle.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER } from "@/lib/stages";

// Thresholds per stage: [min_execution_score, min_tasks_completed]
const LEVEL_THRESHOLDS: Record<string, { score: number; tasks: number }> = {
  Idea:       { score: 65, tasks: 7  },
  Validation: { score: 70, tasks: 10 },
  MVP:        { score: 72, tasks: 14 },
  Launch:     { score: 75, tasks: 14 },
  Growth:     { score: 78, tasks: 20 },
  Revenue:    { score: 80, tasks: 20 }, // Already at max — no promotion
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { project_id?: string };

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ ok: false, error: "project_id required" }, { status: 400 });

  const admin = createAdminClient();

  // Fetch the project
  const { data: project, error: projErr } = await admin
    .from("projects")
    .select("id, startup_stage, execution_score, tasks_completed_total, last_level_up_at")
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

  // Do not trust a browser-provided score or treat a Today check-in as task
  // evidence. Use the stored score and completed project tasks instead.
  const executionScore = project.execution_score ?? 0;
  const { count: completedTaskCount } = await admin
    .from("tasks")
    .select("id, milestones!inner(project_id)", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("is_completed", true)
    .eq("milestones.project_id", project_id);
  const tasksTotal = completedTaskCount ?? 0;
  const threshold        = LEVEL_THRESHOLDS[currentStage];

  // Cooldown prevents repeatedly surfacing the same review opportunity.
  const lastLevelUp = project.last_level_up_at ? new Date(project.last_level_up_at as string) : null;
  const cooldownOk  = !lastLevelUp || (Date.now() - lastLevelUp.getTime()) > 7 * 24 * 60 * 60 * 1000;

  const qualified =
    cooldownOk &&
    executionScore >= threshold.score &&
    tasksTotal     >= threshold.tasks;

  if (qualified) {
    const newStage = STAGE_ORDER[stageIdx + 1];
    return NextResponse.json({
      ok: true,
      eligible: true,
      current_stage: currentStage,
      next_stage: newStage,
      tasks_total: tasksTotal,
      score:       executionScore,
      requires_founder_confirmation: true,
    });
  }

  // Not qualified — return progress toward next level
  const progressPct = Math.round(
    Math.min(100,
      ((executionScore / threshold.score) * 0.5 + (tasksTotal / threshold.tasks) * 0.5) * 100
    )
  );

  return NextResponse.json({
    ok:           true,
    eligible:     false,
    current_stage: currentStage,
    next_stage:    STAGE_ORDER[stageIdx + 1],
    progress_pct:  progressPct,
    needs_score:   Math.max(0, threshold.score - executionScore),
    needs_tasks:   Math.max(0, threshold.tasks - tasksTotal),
  });
}
