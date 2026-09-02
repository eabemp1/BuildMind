import { createAdminClient } from "@/lib/supabase/admin";
import { shouldPromptStageTransition, STAGE_ORDER, normalizeStage } from "@/lib/stages";

/**
 * evaluateAndCacheStageTransition — the SINGLE stage-transition detector.
 *
 * CONSOLIDATION (replaces two previously-divergent implementations):
 *
 *   1. lib/server/stageTransitionCache.ts's checkAndCacheStageTransition —
 *      fired after every task completion, used a much looser bar (3+
 *      completed tasks + 2+ reflections + latest confidence >=3) and wrote
 *      founder_context.pending_stage_transition.
 *   2. app/api/ai/check-stage-transition/route.ts — fired on the project
 *      page load, used the more rigorous three-signal check (all stage
 *      milestones complete + confidence trend >3.5 over 3+ reflections +
 *      <2 overrides in 7 days) via shouldPromptStageTransition(), but only
 *      held its result in component state — never wrote it anywhere, so
 *      the two detectors could (and did) disagree on the same page load,
 *      each rendering its own banner with its own dismiss state.
 *
 * Now there is exactly one place this is computed (here), using the more
 * rigorous three-signal logic, called from exactly two trigger points
 * (after a task completion, and on project page load) that both just call
 * this function and both write to the same founder_context field. Whatever
 * triggered the check, the answer is the same because it's the same query.
 *
 * Also folds in weekly Ghost Goal pace as supporting evidence (not a hard
 * gate — the three signals above still decide shouldPrompt) since
 * consistently beating a weekly pace target is harder to game than
 * milestones, which can be marked complete manually.
 */

export interface StageTransitionEvaluation {
  shouldPrompt: boolean;
  reason: string;
  currentStage: string;
  nextStage: string | null;
  stageMilestonesComplete: boolean;
  reflectionCount: number;
  avgConfidence: number | null;
  overrides: number;
}

/** Monday of the week containing `d`, as an ISO date string — matches the
 *  week_start convention used by app/api/weekly-goal/route.ts. */
function weekStart(d: Date): string {
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export async function evaluateAndCacheStageTransition(
  userId: string,
  projectId: string,
): Promise<StageTransitionEvaluation | null> {
  if (!userId || !projectId) return null;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("startup_stage")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return null;

  const currentStage = normalizeStage(project.startup_stage);
  const currentStageIdx = STAGE_ORDER.indexOf(currentStage);
  const nextStage = currentStageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentStageIdx + 1] : null;

  const [{ data: milestones }, { data: reflections }, { count: overrideCount }, { data: goal }] = await Promise.all([
    supabase.from("milestones").select("id, title, status, order_index").eq("project_id", projectId).eq("user_id", userId),
    supabase
      .from("reflections")
      .select("confidence, outcome")
      .eq("user_id", userId)
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("reflections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("outcome", ["skipped", "overridden", "blocked"])
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    supabase
      .from("weekly_goals")
      .select("tasks_done, target_tasks")
      .eq("project_id", projectId)
      .eq("user_id", userId)
      .eq("week_start", weekStart(new Date()))
      .maybeSingle(),
  ]);

  const stageMilestones = (milestones ?? []).filter((m) =>
    normalizeStage(m.title) === currentStage || m.title?.toLowerCase().includes(currentStage.toLowerCase()),
  );
  const stageMilestonesComplete = stageMilestones.length > 0 ? stageMilestones.every((m) => m.status === "completed") : false;

  const result = shouldPromptStageTransition({
    stageMilestonesComplete,
    recentReflections: (reflections ?? []).map((r) => ({ confidence: r.confidence ?? 3 })),
    recentOverrides: overrideCount ?? 0,
  });

  // Ghost Goal pace — supporting evidence only, appended to the reason
  // string when it strengthens the case. Never flips shouldPrompt on its
  // own, since a founder could otherwise game a stage-up by padding a
  // weekly goal with easy tasks.
  let paceNote = "";
  if (goal && goal.target_tasks > 0) {
    const pace = (goal.tasks_done ?? 0) / goal.target_tasks;
    if (result.shouldPrompt && pace >= 1) {
      paceNote = ` Also on pace or ahead on this week's Ghost Goal (${goal.tasks_done}/${goal.target_tasks}).`;
    }
  }

  const reflectionCount = (reflections ?? []).length;
  const avgConfidence = reflectionCount > 0
    ? Math.round(((reflections ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / reflectionCount) * 10) / 10
    : null;

  const evaluation: StageTransitionEvaluation = {
    shouldPrompt: result.shouldPrompt,
    reason: result.reason + paceNote,
    currentStage,
    nextStage,
    stageMilestonesComplete,
    reflectionCount,
    avgConfidence,
    overrides: overrideCount ?? 0,
  };

  // Single write target — same field name as the old cache-based detector
  // used, so no schema change and no change needed to how it's read.
  await supabase.from("founder_context").upsert(
    {
      user_id: userId,
      pending_stage_transition: evaluation.shouldPrompt
        ? {
            project_id: projectId,
            current_stage: currentStage,
            recommended_stage: nextStage,
            reason: evaluation.reason,
            computed_at: new Date().toISOString(),
          }
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return evaluation;
}
