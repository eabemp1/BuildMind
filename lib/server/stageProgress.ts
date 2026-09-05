/**
 * lib/server/stageProgress.ts
 *
 * FIX (coherence bug): lib/server/stageTransition.ts's "canonical" detector
 * matched a milestone to the current stage by fuzzy-searching its TITLE for
 * a stage keyword, and never selected or read the milestone's real `stage`
 * column at all — the same column the Projects-page waiving logic already
 * uses correctly. Any milestone titled something that doesn't literally
 * contain the stage name ("Get first 10 beta users" for a Launch milestone,
 * for example) silently fell through normalizeStage()'s default ("Idea")
 * and never matched, so stageMilestonesComplete was often permanently
 * false regardless of real progress — the direct cause of "I finished all
 * my Launch tasks and nothing happened anywhere in the app."
 *
 * This file is now the ONE place "is the current stage done" is computed.
 * lib/server/stageTransition.ts, app/api/project/level-up/route.ts, and
 * lib/data/projects.ts (ProjectSummary, so Today's progress ring and the
 * Projects list card read the same number) all call this — not their own
 * copies of the matching logic.
 *
 * Matching priority (same order as the Projects-page waiving logic, kept
 * consistent on purpose so "which milestones count as this stage" never
 * disagrees between the picker and the progress readers):
 *   1. The milestone's own `stage` column, when set.
 *   2. Title-keyword inference, using the same richer keyword set the
 *      waiving logic already uses (not the older, thinner set that used
 *      to live in stageTransition.ts).
 *   3. Falls through to "Idea" — matches nothing except an actual Idea-stage project.
 */

import { STAGE_ORDER } from "@/lib/stages";

export interface StageProgressMilestoneInput {
  id: string;
  title: string;
  status?: string | null;
  stage?: string | null;
}

export interface StageProgressTaskInput {
  milestone_id: string | null;
  is_completed?: boolean | null;
}

export interface StageProgress {
  stage: string;
  totalMilestones: number;
  completedMilestones: number;
  /** 0–100, rounded. 0 when there are no milestones tagged to this stage yet (not 100 — no data isn't done). */
  percent: number;
  /** True only when there's at least one stage milestone and every one of them is complete. */
  isComplete: boolean;
  remainingTitles: string[];
  /**
   * Task-level counts within the same stage-scoped milestones — deliberately
   * separate from `percent`/`isComplete` above, which stay milestone-only and
   * remain the actual gate for "stage complete." A milestone with 8 tasks
   * doesn't complete until the 8th is checked off, so a percent computed from
   * milestones alone barely moves on an ordinary day — most real work is task
   * completion, not milestone completion. These fields exist so a progress
   * indicator can move continuously as tasks are finished, without changing
   * what actually triggers the stage-complete celebration or evidence review.
   */
  totalTasks: number;
  completedTasks: number;
  taskPercent: number;
}

function normalizeStageValue(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const exact = STAGE_ORDER.find(s => s.toLowerCase() === v);
  if (exact) return exact;
  if (/(valid|discover)/.test(v)) return "Validation";
  if (/(mvp|proto)/.test(v)) return "MVP";
  if (/launch/.test(v)) return "Launch";
  if (/growth/.test(v)) return "Growth";
  if (/revenue/.test(v)) return "Revenue";
  if (/idea/.test(v)) return "Idea";
  return null;
}

/** Same keyword set as the Projects-page waiving logic's inferMilestoneStageFromTitle — kept identical on purpose. */
function inferMilestoneStageFromTitle(title: string): string {
  const t = title.toLowerCase();
  if (/(validate|validation|problem.*fit|customer.*interview|survey|hypothesis)/.test(t)) return "Validation";
  if (/(mvp|prototype|build|ship|v1|version 1|working.*product)/.test(t)) return "MVP";
  if (/(launch|announce|go.live|product.*hunt|beta)/.test(t)) return "Launch";
  if (/(growth|scale|retention|churn|referral|acquisition)/.test(t)) return "Growth";
  if (/(revenue|monetize|pricing|subscription|mrr|arr)/.test(t)) return "Revenue";
  return "Idea";
}

/** Which stage a milestone belongs to — real `stage` column first, title inference as fallback. */
export function resolveMilestoneStage(milestone: StageProgressMilestoneInput): string {
  if (milestone.stage) {
    const normalized = normalizeStageValue(milestone.stage);
    if (normalized) return normalized;
  }
  return inferMilestoneStageFromTitle(milestone.title);
}

/**
 * Pure function — takes milestones already fetched by the caller (no DB
 * access here) so it can be reused both against a fresh query
 * (stageTransition.ts, level-up) and against milestones a caller already
 * has in memory (getProjectSummaries, which fetches all a project's
 * milestones anyway for the pending-work list).
 */
export function computeStageProgress(
  milestones: StageProgressMilestoneInput[],
  currentStage: string,
  tasks: StageProgressTaskInput[] = [],
): StageProgress {
  const stageMilestones = milestones.filter(m => resolveMilestoneStage(m) === currentStage);
  const completed = stageMilestones.filter(m => m.status === "completed");
  const total = stageMilestones.length;

  const stageMilestoneIds = new Set(stageMilestones.map(m => m.id));
  const stageTasks = tasks.filter(t => t.milestone_id && stageMilestoneIds.has(t.milestone_id));
  const completedTasks = stageTasks.filter(t => t.is_completed);

  return {
    stage: currentStage,
    totalMilestones: total,
    completedMilestones: completed.length,
    percent: total > 0 ? Math.round((completed.length / total) * 100) : 0,
    isComplete: total > 0 && completed.length === total,
    remainingTitles: stageMilestones.filter(m => m.status !== "completed").map(m => m.title),
    totalTasks: stageTasks.length,
    completedTasks: completedTasks.length,
    taskPercent: stageTasks.length > 0 ? Math.round((completedTasks.length / stageTasks.length) * 100) : 0,
  };
}
