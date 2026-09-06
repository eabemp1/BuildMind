import { createAdminClient } from "@/lib/supabase/admin";
import type { StageProgress } from "@/lib/server/stageProgress";
import type { ReadinessTier } from "@/lib/server/stageReadiness";
import { getProjectReadiness } from "@/lib/server/projectReadiness";

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
 * Now there is exactly one place this is computed (here), called from
 * exactly two trigger points (after a task completion, and on project page
 * load) that both just call this function and both write to the same
 * founder_context field. Whatever triggered the check, the answer is the
 * same because it's the same query.
 *
 * FURTHER CONSOLIDATION (see lib/server/stageReadiness.ts): the rigorous
 * three-signal logic above only decided a binary shouldPrompt from
 * milestone completion + reflection confidence + overrides — it never
 * looked at whether any real evidence (lib/server/stageEvidence.ts) had
 * been captured. That meant a founder who finished every task with zero
 * evidence and thin reflections got the exact same silence as a founder
 * who hadn't started — no honest middle state. `computeStageReadiness()`
 * now merges all three signals (milestones + evidence + reflection
 * conviction) into a 3-tier answer (not_ready / checklist_only / ready),
 * and shouldPrompt is now true once milestones are complete, not only once
 * every signal fully lines up — so the banner can honestly say "checklist
 * done, evidence still thin" instead of staying silent.
 *
 * Also folds in weekly Ghost Goal pace as supporting evidence (not a hard
 * gate) since consistently beating a weekly pace target is harder to game
 * than milestones, which can be marked complete manually.
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
  /** Real, stage-scoped milestone counts — same numbers a progress ring shows, not just a boolean. */
  stageProgress: StageProgress;
  /**
   * The merged 3-signal answer (milestones + evidence + reflection
   * conviction) — see lib/server/stageReadiness.ts. `shouldPrompt` above
   * is now true for BOTH "checklist_only" and "ready" tiers (milestones
   * complete is enough to surface a banner); `readinessTier` is what tells
   * the UI whether to show a genuine "ready" state or the honest
   * "checklist done, evidence thin" state instead of silently treating
   * them the same.
   */
  readinessTier: ReadinessTier;
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

  // FIX (this pass): this function used to run its own copy of the
  // project/milestones/reflections/evidence fetch and its own
  // computeStageReadiness() call — the same 5 queries the new
  // /api/founder-context/standing route needed too, for the co-founder
  // mascot and Execution page. Rather than write a third copy, both now
  // call this shared, side-effect-free fetch. Only the cache write below
  // (pending_stage_transition) stays local to this function, since that's
  // the one part that's only correct to run at this function's own
  // cadence (Today's automatic nudge, the "Check stage readiness"
  // button) — not on every high-frequency standing poll.
  const result = await getProjectReadiness(userId, projectId);
  if (!result) return null;
  const { readiness, currentStage, nextStage } = result;
  const stageProgress = readiness.stageProgress;
  const stageMilestonesComplete = stageProgress.isComplete;
  const reflectionCount = readiness.reflection.count;
  const avgConfidence = readiness.reflection.avgConfidence;
  const overrideCount = readiness.reflection.overrides;

  // Ghost Goal pace is genuinely a stage-transition-only concern (it only
  // ever appends supporting text to the "ready" reason, never feeds
  // readiness itself), so it stays fetched here rather than moving into
  // the shared getProjectReadiness().
  const { data: goal } = await supabase
    .from("weekly_goals")
    .select("tasks_done, target_tasks")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .eq("week_start", weekStart(new Date()))
    .maybeSingle();

  const shouldPrompt = stageMilestonesComplete && !!nextStage;
  let reason = readiness.headline + (readiness.detail ? ` ${readiness.detail}` : "");

  // Ghost Goal pace — supporting evidence only, appended to the reason
  // string when it strengthens the case. Never flips shouldPrompt on its
  // own, since a founder could otherwise game a stage-up by padding a
  // weekly goal with easy tasks.
  if (goal && goal.target_tasks > 0) {
    const pace = (goal.tasks_done ?? 0) / goal.target_tasks;
    if (readiness.tier === "ready" && pace >= 1) {
      reason += ` Also on pace or ahead on this week's Ghost Goal (${goal.tasks_done}/${goal.target_tasks}).`;
    }
  }

  const evaluation: StageTransitionEvaluation = {
    shouldPrompt,
    reason,
    currentStage,
    nextStage,
    stageMilestonesComplete,
    reflectionCount,
    avgConfidence,
    overrides: overrideCount,
    stageProgress,
    readinessTier: readiness.tier,
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
            // Real counts, not just the boolean, so the UI can show "9/9
            // milestones" instead of a bare "you're eligible" claim.
            stage_milestones_completed: stageProgress.completedMilestones,
            stage_milestones_total: stageProgress.totalMilestones,
            // The merged tier — lets Today distinguish a genuine "ready"
            // celebration from the honest "checklist done, evidence thin"
            // state instead of showing the same banner for both.
            readiness_tier: readiness.tier,
            evidence_filled: readiness.evidence?.filledSlots ?? null,
            evidence_total: readiness.evidence?.totalSlots ?? null,
          }
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return evaluation;
      }
