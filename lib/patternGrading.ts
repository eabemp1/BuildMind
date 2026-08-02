/**
 * lib/patternGrading.ts — Pure grading math for weekly pattern dimensions.
 *
 * WHY DETERMINISTIC, NOT AI-GENERATED: a grade is a claim ("B+", "72/100")
 * that a founder will treat as authoritative feedback. Same discipline as
 * lib/milestonePacing.ts and lib/momentum.ts — every grade here is a pure
 * function of real, already-computed inputs (completion rate, momentum
 * delta, milestone pacing risk, avoidance-zone resolution). The AI story
 * synthesis layer may reference these grades in prose, but it must never
 * invent or adjust one — same "restate, don't estimate" rule as everywhere
 * else in this feature.
 *
 * Dimensions (each 0-100, banded to a letter grade):
 *
 *  1. Execution Consistency — task completion rate this week, penalized for
 *     zero-activity days (a founder who does 100% of tasks on one day and
 *     nothing else all week is less consistent than one who spreads it out,
 *     even at the same completion rate).
 *  2. Backlog Clearance — of tasks that existed before this week and were
 *     still open at week start, how many got finished this week. This is
 *     deliberately NOT "tasks accepted vs completed" — there is no
 *     "accepted" outcome value anywhere in the committed schema
 *     (supabase/schema-idempotent.sql's action_logs-adjacent tables only
 *     define completed/partial/abandoned/blocked/learned), so that
 *     distinction isn't real data. Backlog Clearance uses only
 *     tasks.created_at/status/updated_at, columns confirmed to exist.
 *  3. Deadline Recovery — share of active milestones NOT in "high" pacing
 *     risk (lib/milestonePacing.ts). Reflects whether slipping milestones
 *     are being pulled back, not whether every milestone is easy.
 *  4. Avoidance Resistance — un-ghosted items this week as a share of
 *     current avoidance zones. Explicitly capped at "unknown" when there
 *     are no avoidance zones tracked yet — 100% of zero is not a real signal.
 *
 * All grades are informational, not punitive framing — the letter bands
 * are deliberately generous (a C is "adequate," not "failing") because this
 * sits next to an encouragement-oriented product surface, not a report card.
 */

export type Grade = "A" | "B" | "C" | "D" | "F" | "N/A";

export interface GradedDimension {
  label: string;
  score: number | null; // 0-100, null when not computable
  grade: Grade;
  basis: string; // human-readable citation of the real numbers behind this grade
}

function bandGrade(score: number | null): Grade {
  if (score === null) return "N/A";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "F";
}

export function gradeExecutionConsistency(input: {
  tasksCompleted: number;
  tasksTotal: number;
  activeDaysThisWeek: number; // days (0-7) with at least one completed task
}): GradedDimension {
  const { tasksCompleted, tasksTotal, activeDaysThisWeek } = input;
  if (tasksTotal === 0) {
    return { label: "Execution Consistency", score: null, grade: "N/A", basis: "No tasks logged this week." };
  }
  const completionRate = (tasksCompleted / tasksTotal) * 100;
  // Spread bonus/penalty: 4+ active days = full credit, fewer days pulls the
  // score down even at a high completion rate (see header rationale).
  const spreadFactor = Math.min(1, activeDaysThisWeek / 4);
  const score = Math.round(completionRate * (0.7 + 0.3 * spreadFactor));
  return {
    label: "Execution Consistency",
    score,
    grade: bandGrade(score),
    basis: `${tasksCompleted}/${tasksTotal} tasks completed (${Math.round(completionRate)}%) across ${activeDaysThisWeek} active day${activeDaysThisWeek === 1 ? "" : "s"}.`,
  };
}

export function gradeBacklogClearance(input: {
  backlogTotal: number;    // tasks that existed before this week and were still open at week start
  backlogCleared: number;  // of those, how many got completed during this week
}): GradedDimension {
  const { backlogTotal, backlogCleared } = input;
  if (backlogTotal === 0) {
    return { label: "Backlog Clearance", score: null, grade: "N/A", basis: "No carried-over tasks from before this week." };
  }
  const score = Math.round(Math.min(100, (backlogCleared / backlogTotal) * 100));
  return {
    label: "Backlog Clearance",
    score,
    grade: bandGrade(score),
    basis: `${backlogCleared} of ${backlogTotal} pre-existing open tasks cleared this week.`,
  };
}

export function gradeDeadlineRecovery(input: {
  milestoneRisks: Array<"low" | "medium" | "high" | "unknown">;
}): GradedDimension {
  const known = input.milestoneRisks.filter((r) => r !== "unknown");
  if (known.length === 0) {
    return { label: "Deadline Recovery", score: null, grade: "N/A", basis: "No milestones with enough data to pace yet." };
  }
  const highRisk = known.filter((r) => r === "high").length;
  const mediumRisk = known.filter((r) => r === "medium").length;
  // Low risk = full credit, medium = half credit, high = no credit.
  const score = Math.round(((known.length - highRisk - mediumRisk * 0.5) / known.length) * 100);
  return {
    label: "Deadline Recovery",
    score,
    grade: bandGrade(score),
    basis: `${known.length - highRisk} of ${known.length} tracked milestones on pace or recoverable.`,
  };
}

export function gradeAvoidanceResistance(input: {
  unGhostedCount: number;
  currentAvoidanceZoneCount: number;
}): GradedDimension {
  const { unGhostedCount, currentAvoidanceZoneCount } = input;
  if (currentAvoidanceZoneCount === 0 && unGhostedCount === 0) {
    return { label: "Avoidance Resistance", score: null, grade: "N/A", basis: "No avoidance zones tracked yet." };
  }
  // Zones remaining after this week's un-ghosting, as a share of what was
  // being avoided — resistance credit for shrinking the list, not for
  // having a short list to begin with.
  const baseline = currentAvoidanceZoneCount + unGhostedCount;
  const score = baseline === 0 ? null : Math.round((unGhostedCount / baseline) * 100);
  return {
    label: "Avoidance Resistance",
    score,
    grade: bandGrade(score),
    basis: unGhostedCount > 0
      ? `Moved on ${unGhostedCount} previously avoided item${unGhostedCount === 1 ? "" : "s"} this week.`
      : `${currentAvoidanceZoneCount} avoidance zone${currentAvoidanceZoneCount === 1 ? "" : "s"} still untouched.`,
  };
}

/** computeWeeklyGrades — the single entry point the route should call. */
export function computeWeeklyGrades(input: {
  tasksCompleted: number;
  tasksTotal: number;
  backlogTotal: number;
  backlogCleared: number;
  activeDaysThisWeek: number;
  milestoneRisks: Array<"low" | "medium" | "high" | "unknown">;
  unGhostedCount: number;
  currentAvoidanceZoneCount: number;
}): GradedDimension[] {
  return [
    gradeExecutionConsistency(input),
    gradeBacklogClearance({ backlogTotal: input.backlogTotal, backlogCleared: input.backlogCleared }),
    gradeDeadlineRecovery({ milestoneRisks: input.milestoneRisks }),
    gradeAvoidanceResistance({
      unGhostedCount: input.unGhostedCount,
      currentAvoidanceZoneCount: input.currentAvoidanceZoneCount,
    }),
  ];
}
