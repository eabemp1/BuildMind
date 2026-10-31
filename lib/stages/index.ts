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
  milestones: Array<{ title: string; status?: string | null; created_at?: string; order_index?: number | null; is_completed?: boolean | null }>,
  tasks: Array<{ milestone_id: string; is_completed: boolean }>,
  milestoneIdMap: Map<string, string>,
): StartupStage {
  if (!milestones.length) return "Idea";

  const sorted = [...milestones].sort((a, b) => {
    if (typeof a.order_index === "number" || typeof b.order_index === "number") {
      return (a.order_index ?? Number.MAX_SAFE_INTEGER) - (b.order_index ?? Number.MAX_SAFE_INTEGER);
    }
    const dateA = new Date(a.created_at ?? 0).getTime();
    const dateB = new Date(b.created_at ?? 0).getTime();
    return dateA - dateB;
  });

  const isMilestoneComplete = (
    m: (typeof sorted)[0] & { id?: string },
  ): boolean => {
    if (m.is_completed === true) return true;
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

  // If every known milestone is complete, the founder has reached the final stage.
  if (lastCompleteIdx >= sorted.length - 1 && sorted.every((m) => isMilestoneComplete(m))) {
    return "Revenue";
  }

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
  if (milestoneRate >= 0.8) return "Revenue";
  if (milestoneRate >= 0.75 && taskRate >= 0.7) return "Growth";
  if (milestoneRate >= 0.55) return "Launch";
  if (milestoneRate >= 0.35) return "MVP";
  if (milestoneRate >= 0.15 || taskRate >= 0.3) return "Validation";
  return "Idea";
}

/**
 * shouldPromptStageTransition — The three-signal stage transition trigger.
 *
 * From the verbal transcript recommendations:
 * Don't use time as the primary signal. Use three signals together:
 *   1. All stage milestones complete
 *   2. Average reflection confidence above 3.5 in last 3+ reflections
 *   3. Fewer than 2 overrides/skips in the last 7 days
 *
 * When all three align — that's when the transition prompt fires.
 */
export function shouldPromptStageTransition(params: {
  stageMilestonesComplete: boolean;
  recentReflections: Array<{ confidence: number }>;
  recentOverrides: number; // overrides/skips in last 7 days
}): { shouldPrompt: boolean; reason: string } {
  const { stageMilestonesComplete, recentReflections, recentOverrides } = params;

  if (!stageMilestonesComplete) {
    return { shouldPrompt: false, reason: "stage_milestones_incomplete" };
  }

  const hasEnoughReflections = recentReflections.length >= 3;
  const avgConfidence = hasEnoughReflections
    ? recentReflections.reduce((sum, r) => sum + r.confidence, 0) / recentReflections.length
    : 0;
  const confidenceSolid = avgConfidence > 3.5;

  if (!hasEnoughReflections || !confidenceSolid) {
    return {
      shouldPrompt: false,
      reason: hasEnoughReflections
        ? `confidence_too_low:${avgConfidence.toFixed(1)}`
        : "insufficient_reflections",
    };
  }

  const executionStable = recentOverrides < 2;
  if (!executionStable) {
    return { shouldPrompt: false, reason: `too_many_overrides:${recentOverrides}` };
  }

  // All three signals aligned
  return {
    shouldPrompt: true,
    reason: `all_signals_aligned:confidence=${avgConfidence.toFixed(1)},overrides=${recentOverrides}`,
  };
}

/**
 * The five bands the daily-task planner works in. One place decides which band a stage belongs to,
 * so the planner, the first-run bank and the roadmap can't drift apart.
 * Revenue shares the growth band: both are about people who already use the product.
 */
export type StageBand = "idea" | "validation" | "building" | "launch" | "growth";

const BAND_OF: Record<StartupStage, StageBand> = {
  Idea: "idea",
  Validation: "validation",
  MVP: "building",
  Launch: "launch",
  Growth: "growth",
  Revenue: "growth",
};

/**
 * Band for a stored stage. Canonical names map exactly; free text (older rows, the chip labels shown
 * before the stage screen) falls back to keywords. Anything unrecognised is "validation": the safest
 * default is to talk to people, never to assume traction.
 */
export function stageBand(raw: string | null | undefined): StageBand {
  const v = String(raw ?? "").trim();
  const exact = STAGE_ORDER.find((s) => s.toLowerCase() === v.toLowerCase());
  if (exact) return BAND_OF[exact];
  const s = v.toLowerCase();
  if (/idea|concept|explor/.test(s)) return "idea";
  if (/valid|discover|problem/.test(s)) return "validation";
  if (/build|mvp|prototype|develop/.test(s)) return "building";
  if (/launch|beta|early/.test(s)) return "launch";
  if (/grow|revenue|scale|traction|paying/.test(s)) return "growth";
  return "validation";
}

/**
 * The band to plan for. The stated stage stands, with one exception: Growth or Revenue means people
 * already use the product, so a founder who has said they have no users is planned as Launch
 * (getting the first users). MVP and Launch with no users are real states and are left alone.
 */
export function effectiveBand(raw: string | null | undefined, facts: { noUsers?: boolean } = {}): { band: StageBand; adjusted: boolean } {
  const band = stageBand(raw);
  if (band === "growth" && facts.noUsers) return { band: "launch", adjusted: true };
  return { band, adjusted: false };
}

const PLAIN: Record<StartupStage, { long: string; short: string }> = {
  Idea: { long: "Exploring the idea", short: "Idea" },
  Validation: { long: "Checking people want it", short: "Talk to people" },
  MVP: { long: "Building it", short: "Build" },
  Launch: { long: "Getting first users", short: "First users" },
  Growth: { long: "Growing", short: "Grow" },
  Revenue: { long: "Earning revenue", short: "Earn" },
};

/** What the stage means in everyday words, for founders who don't know the startup vocabulary. Unknown values are returned unchanged. */
export function plainStage(raw: string | null | undefined, form: "long" | "short" = "long"): string {
  const v = String(raw ?? "").trim();
  const exact = STAGE_ORDER.find((s) => s.toLowerCase() === v.toLowerCase());
  return exact ? PLAIN[exact][form] : v;
    }
