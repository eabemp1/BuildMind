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
  milestones: Array<{ title: string; is_completed: boolean | null; order_index: number }>,
  tasks: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap: Map<string, string>, // milestoneId → milestoneTitle
): StartupStage {
  if (!milestones.length) return "Idea";

  const sorted = [...milestones].sort((a, b) => a.order_index - b.order_index);

  const isMilestoneComplete = (
    m: (typeof sorted)[0] & { id?: string },
  ): boolean => {
    if (m.is_completed) return true;
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
  if (lastCompleteIdx >= sorted.length - 1) return "Revenue";

  const nextMilestone = sorted[lastCompleteIdx + 1];
  return normalizeStage(nextMilestone.title);
}

/** Stage rank for comparison (higher = more advanced) */
export function stageRank(stage: string): number {
  const idx = STAGE_ORDER.indexOf(normalizeStage(stage));
  return idx === -1 ? 0 : idx;
}
