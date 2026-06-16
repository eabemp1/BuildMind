/**
 * app/api/project/level-up/route.ts
 *
 * POST → called after every Today page check-in.
 *         Checks if the founder has earned an automatic stage promotion.
 *
 * Level-up criteria (all must be met):
 *  - execution_score >= LEVEL_THRESHOLD for this stage
 *  - tasks_completed_total >= TASKS_REQUIRED for this stage  
 *  - last_level_up_at is either null or > 7 days ago (prevents instant re-promotion)
 *
 * Returns:
 *  { leveled_up: false } — no change
 *  { leveled_up: true, old_stage, new_stage } — promotion happened
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

  const body = await req.json().catch(() => ({})) as {
    project_id?: string;
    new_execution_score?: number;
  };

  const { project_id, new_execution_score } = body;
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
    return NextResponse.json({ ok: false, leveled_up: false });
  }

  const currentStage = (project.startup_stage ?? "Idea") as string;
  const stageIdx     = STAGE_ORDER.indexOf(currentStage as typeof STAGE_ORDER[number]);

  // Already at max stage or unknown stage
  if (stageIdx < 0 || stageIdx >= STAGE_ORDER.length - 1) {
    return NextResponse.json({ ok: true, leveled_up: false });
  }

  const executionScore   = new_execution_score ?? project.execution_score ?? 0;
  const tasksTotal       = (project.tasks_completed_total ?? 0) + 1; // include this check-in
  const threshold        = LEVEL_THRESHOLDS[currentStage];

  // Check cooldown — don't level up more than once per 7 days
  const lastLevelUp = project.last_level_up_at ? new Date(project.last_level_up_at as string) : null;
  const cooldownOk  = !lastLevelUp || (Date.now() - lastLevelUp.getTime()) > 7 * 24 * 60 * 60 * 1000;

  const qualified =
    cooldownOk &&
    executionScore >= threshold.score &&
    tasksTotal     >= threshold.tasks;

  // Always update the task counter + last_checkin_date
  const today = new Date().toISOString().slice(0, 10);
  await admin
    .from("projects")
    .update({
      tasks_completed_total: tasksTotal,
      last_checkin_date:     today,
      ...(new_execution_score != null ? { execution_score: new_execution_score } : {}),
      ...(qualified ? {
        startup_stage:   STAGE_ORDER[stageIdx + 1],
        last_level_up_at: new Date().toISOString(),
      } : {}),
    })
    .eq("id", project_id)
    .eq("user_id", user.id);

  if (qualified) {
    return NextResponse.json({
      ok:          true,
      leveled_up:  true,
      old_stage:   currentStage,
      new_stage:   STAGE_ORDER[stageIdx + 1],
      tasks_total: tasksTotal,
      score:       executionScore,
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
    leveled_up:   false,
    current_stage: currentStage,
    next_stage:    STAGE_ORDER[stageIdx + 1],
    progress_pct:  progressPct,
    needs_score:   Math.max(0, threshold.score - executionScore),
    needs_tasks:   Math.max(0, threshold.tasks - tasksTotal),
  });
}
