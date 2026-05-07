/**
 * lib/stages/index.ts — v3
 *
 * Fix #15: Projects were showing "Revenue" stage when they were at Idea/other
 * stage because inferStage() used a pure milestone completion RATIO, ignoring
 * the user-set startup_stage column.
 *
 * The canonical stage is now:
 *   1. startup_stage column in the DB (set by the user / onboarding)
 *   2. Only fall back to inferStageFromMilestones() if startup_stage is null/empty
 *
 * inferStage() (the ratio heuristic) is now DEPRECATED — kept for API compat
 * but it only runs when there is truly no stage data.
 */

export const STAGE_ORDER = ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"] as const;
export type StartupStage = (typeof STAGE_ORDER)[number];

export function normalizeStage(raw: string | null | undefined): StartupStage {
  const v = String(raw ?? "").trim().toLowerCase();
  if (v.includes("valid") || v.includes("discover")) return "Validation";
  if (v.includes("mvp") || v.includes("proto")) return "MVP";
  if (v.includes("launch")) return "Launch";
  if (v.includes("growth")) return "Growth";
  if (v.includes("revenue")) return "Revenue";
  // explicit "idea" or unknown → Idea
  return "Idea";
}

/**
 * getCanonicalStage — single source of truth for a project's stage.
 *
 * Priority:
 *   1. startup_stage column from the project row (user-set, explicit)
 *   2. inferStageFromMilestones() if milestones are provided
 *   3. "Idea" as the safe default
 *
 * NEVER derives stage from a raw completion ratio alone — that caused
 * projects to flip to "Revenue" as soon as 80% of tasks were ticked off
 * regardless of what stage the founder actually set.
 */
export function getCanonicalStage(
  projectStartupStage: string | null | undefined,
  milestones?: Array<{ title: string; status?: string | null; created_at?: string }>,
  tasks?: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap?: Map<string, string>,
): StartupStage {
  // 1. Honour explicit startup_stage from DB
  if (projectStartupStage && projectStartupStage.trim() !== "") {
    return normalizeStage(projectStartupStage);
  }

  // 2. Milestone-based inference (only when no explicit stage set)
  if (milestones && milestones.length > 0 && tasks && milestoneIdMap) {
    return inferStageFromMilestones(milestones, tasks, milestoneIdMap);
  }

  return "Idea";
}

/**
 * inferStageFromMilestones — infer stage from milestone completion data.
 *
 * Only call this when startup_stage is not set on the project.
 * Uses milestone title matching + completion status.
 */
export function inferStageFromMilestones(
  milestones: Array<{ title: string; status?: string | null; created_at?: string }>,
  tasks: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap: Map<string, string>,
): StartupStage {
  if (!milestones.length) return "Idea";

  const sorted = [...milestones].sort((a, b) => {
    const dateA = new Date(a.created_at ?? 0).getTime();
    const dateB = new Date(b.created_at ?? 0).getTime();
    return dateA - dateB;
  });

  const isMilestoneComplete = (
    m: (typeof sorted)[0] & { id?: string },
  ): boolean => {
    if (m.status === "completed") return true;
    const milestoneTasks = tasks.filter(
      (t) => milestoneIdMap.get(t.milestone_id) === m.title,
    );
    if (!milestoneTasks.length) return false;
    return milestoneTasks.every((t) => t.is_completed);
  };

  let lastCompleteIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i] as (typeof sorted)[0] & { id?: string };
    if (isMilestoneComplete(m)) lastCompleteIdx = i;
  }

  if (lastCompleteIdx === -1) return "Idea";

  // If the milestone that's next has a recognisable stage name, use it.
  if (lastCompleteIdx < sorted.length - 1) {
    const nextMilestone = sorted[lastCompleteIdx + 1];
    const inferred = normalizeStage(nextMilestone.title);
    // Only advance if the title actually maps to a stage (not "Idea" fallback)
    if (inferred !== "Idea" || nextMilestone.title.toLowerCase().includes("idea")) {
      return inferred;
    }
    // If title doesn't map, advance one stage from last complete milestone
    const currentInferred = normalizeStage(sorted[lastCompleteIdx].title);
    const currentIdx = STAGE_ORDER.indexOf(currentInferred);
    if (currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1) {
      return STAGE_ORDER[currentIdx + 1];
    }
  }

  // All milestones complete
  if (lastCompleteIdx >= sorted.length - 1) {
    const lastStage = normalizeStage(sorted[sorted.length - 1].title);
    return lastStage === "Idea" ? "Revenue" : lastStage;
  }

  return "Idea";
}

/** Stage rank for comparison (higher = more advanced) */
export function stageRank(stage: string): number {
  const idx = STAGE_ORDER.indexOf(normalizeStage(stage));
  return idx === -1 ? 0 : idx;
}

/**
 * inferStage — DEPRECATED ratio heuristic.
 *
 * Kept for API backwards compatibility. Do NOT use in new code — use
 * getCanonicalStage() instead.
 *
 * Bug: this returned "Revenue" for any project where 80% of milestones were
 * complete, even an Idea-stage project with only 5 tasks. Now only used
 * as a last resort when no startup_stage and no milestone data is available.
 */
export function inferStage(
  completedTasks: number,
  totalTasks: number,
  completedMilestones: number,
  totalMilestones: number,
): string {
  if (totalTasks === 0 && totalMilestones === 0) return "Idea";
  // Use a more conservative threshold to avoid premature stage advancement
  const milestoneRate = completedMilestones / Math.max(1, totalMilestones);
  const taskRate = completedTasks / Math.max(1, totalTasks);
  // Only call "Revenue" if milestones are truly done AND tasks are done
  if (milestoneRate >= 0.95 && taskRate >= 0.9) return "Revenue";
  if (milestoneRate >= 0.75 && taskRate >= 0.7) return "Growth";
  if (milestoneRate >= 0.55) return "Launch";
  if (milestoneRate >= 0.35) return "MVP";
  if (milestoneRate >= 0.15 || taskRate >= 0.3) return "Validation";
  return "Idea";
}
