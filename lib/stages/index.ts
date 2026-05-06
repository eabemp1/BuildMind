/**
 * lib/stages/index.ts
 *
 * Stage inference logic — extracted from lib/buildmind.ts.
 * Single responsibility: given milestone/task data, answer "what stage is this startup in?"
 *
 * Imported by:
 *   lib/buildmind.ts   (re-exported for backwards compatibility)
 *   lib/data/projects.ts
 *   app/api/ai/today-action/route.ts
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
  return "Idea";
}

/**
 * Infer the correct startup stage from milestone completion data.
 *
 * Logic:
 * - Map milestone titles to stage names
 * - Find the last milestone that is fully complete
 * - The current stage is the NEXT one after the last complete milestone
 * - If none complete → "Idea"
 * - If all complete → "Revenue"
 */
export function inferStageFromMilestones(
  milestones: Array<{ id?: string; title: string; status?: string | null; is_completed?: boolean | null; order_index?: number; created_at?: string }>,
  tasks: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap: Map<string, string>, // milestoneId → milestoneTitle
): StartupStage {
  if (!milestones.length) return "Idea";

  // Prefer roadmap order_index when present, otherwise fall back to created_at.
  const sorted = [...milestones].sort((a, b) => {
    if (typeof a.order_index === "number" || typeof b.order_index === "number") {
      return (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER);
    }
    const dateA = new Date(a.created_at ?? 0).getTime();
    const dateB = new Date(b.created_at ?? 0).getTime();
    return dateA - dateB;
  });

  const isMilestoneComplete = (m: (typeof sorted)[0]): boolean => {
    if (m.status === 'completed') return true;
    if (m.is_completed === true) return true;
    const milestoneTasks = tasks.filter(
      (t) => t.milestone_id === m.id || milestoneIdMap.get(t.milestone_id) === m.title,
    );
    if (!milestoneTasks.length) return false;
    return milestoneTasks.every((t) => t.is_completed);
  };

  let lastCompleteIdx = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (isMilestoneComplete(sorted[i])) lastCompleteIdx = i;
  }

  if (lastCompleteIdx === -1) return "Idea";
  if (lastCompleteIdx >= sorted.length - 1) return "Revenue";

  const nextMilestone = sorted[lastCompleteIdx + 1];
  return normalizeStage(nextMilestone.title);
}

/** Stage rank for comparison (higher = more advanced) */
export function stageRank(stage: string): number {
  const idx = STAGE_ORDER.indexOf(normalizeStage(stage));
  return idx === -1 ? 0 : idx;
}

/**
 * inferStage — flat milestone/task ratio heuristic used in API routes.
 *
 * Canonical version — previously duplicated in today-action and coach routes.
 * Import from here; do not redeclare locally.
 */
export function inferStage(
  completedTasks: number,
  totalTasks: number,
  completedMilestones: number,
  totalMilestones: number,
): string {
  if (totalTasks === 0) return "Idea";
  const milestoneRate = completedMilestones / Math.max(1, totalMilestones);
  const taskRate = completedTasks / Math.max(1, totalTasks);
  if (milestoneRate >= 0.8) return "Revenue";
  if (milestoneRate >= 0.6) return "Launch";
  if (milestoneRate >= 0.4) return "MVP";
  if (milestoneRate >= 0.2 || taskRate >= 0.3) return "Validation";
  return "Idea";
}
