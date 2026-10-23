/**
 * lib/beliefCalibration.ts - honest confidence for the beliefs in the Founder Mirror.
 *
 * Before, every "you tend to be strong at X" belief reused one profile-wide number (how much data
 * BuildMind has about you overall), so three beliefs backed by 3 tasks each read 95%, 93% and 89%.
 * A belief is only as sure as the evidence behind THAT belief. This module computes confidence from
 * the actual task counts using the Wilson score lower bound: the lowest completion rate that is still
 * plausible given n observations. Few observations give a low number that grows as evidence builds.
 *
 *   3 of 3 completed  -> ~65%      10 of 10 -> ~88%      30 of 30 -> ~96%
 *
 * Pure and deterministic. No IO.
 */

export interface PatternStat {
  label: string;
  completed: number;
  total: number;
}

export type BeliefKind = "strength" | "avoidance" | "window";

export interface CalibratedConfidence {
  /** 0-1, never above the profile-wide ceiling passed in. */
  confidence: number;
  /** How many tasks the belief rests on, or null when BuildMind has no per-category count. */
  observations: number | null;
  /** One honest line: what the number is based on. */
  basis: string;
  /** True when there is too little evidence to call this more than a first reading. */
  early: boolean;
}

/** z for a one-sided ~90% bound. Conservative without being useless at moderate n. */
const Z = 1.2816;
/** Below this many tasks a belief is only an early reading. */
export const EARLY_BELOW = 5;
/** Ceiling when BuildMind knows a belief exists but not how many tasks stand behind it. */
const UNKNOWN_CEILING = 0.55;
const WINDOW_CONFIDENCE = 0.5;

export function wilsonLowerBound(successes: number, n: number, z = Z): number {
  if (!(n > 0)) return 0;
  const k = Math.max(0, Math.min(n, successes));
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return Math.max(0, Math.min(1, (centre - margin) / denom));
}

function norm(s: string): string {
  return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Find the per-category task counts for a belief's subject ("Usability sessions"). */
export function findPatternStat(subject: string, stats: PatternStat[] | undefined | null): PatternStat | null {
  if (!stats?.length) return null;
  const s = norm(subject);
  if (!s) return null;
  let best: PatternStat | null = null;
  for (const st of stats) {
    const l = norm(st.label);
    if (!l) continue;
    if (l === s) return st;
    if ((s.includes(l) || l.includes(s)) && (!best || st.total > best.total)) best = st;
  }
  return best;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function calibrateBelief(input: { kind: BeliefKind; ceiling: number; stat?: PatternStat | null }): CalibratedConfidence {
  const ceiling = Math.max(0, Math.min(1, input.ceiling));
  if (input.kind === "window") {
    return {
      confidence: Math.min(ceiling, WINDOW_CONFIDENCE),
      observations: null,
      basis: "Based on when your completed and dropped activity happened",
      early: true,
    };
  }
  const stat = input.stat;
  if (!stat || !(stat.total > 0)) {
    return {
      confidence: Math.min(ceiling, UNKNOWN_CEILING),
      observations: null,
      basis: "Based on your overall activity; BuildMind has no count of tasks for this specific area yet",
      early: true,
    };
  }
  const n = Math.round(stat.total);
  const done = Math.max(0, Math.min(n, Math.round(stat.completed)));
  const wanted = input.kind === "strength" ? done : n - done;
  const raw = wilsonLowerBound(wanted, n);
  const confidence = Math.round(Math.min(ceiling, raw) * 100) / 100;
  const basis = input.kind === "strength"
    ? `${done} of ${n} related ${plural(n, "task", "tasks")} completed`
    : `${n - done} of ${n} related ${plural(n, "task", "tasks")} not finished`;
  return { confidence, observations: n, basis, early: n < EARLY_BELOW };
}

/** The subject of a Mirror belief: "You tend to avoid outreach." -> "outreach". */
export function beliefSubject(text: string): string {
  return String(text)
    .replace(/^you tend to be strong at\s+/i, "")
    .replace(/^you tend to avoid\s+/i, "")
    .replace(/[.]+$/, "")
    .trim();
}

export type CorrectionVerdict = "holding" | "not_holding" | "mixed" | "too_early";

export interface CorrectionCheck {
  verdict: CorrectionVerdict;
  /** Related tasks seen since the founder corrected this belief. */
  since_total: number;
  since_completed: number;
  /** One honest line for the Mirror. */
  line: string;
}

/** Minimum new related tasks before we say anything about whether a correction held. */
export const CORRECTION_CHECK_MIN = 3;

/**
 * Did the data since a correction agree with it? Compares the related-task counts now with the counts
 * saved when the founder corrected the belief. Assumes the correction says the belief is too strong
 * (the usual case: "I do not avoid this", "this is not really a strength"); the line states the counts
 * so the founder can judge it themselves. Pure.
 */
export function checkCorrection(
  kind: BeliefKind,
  at: { completed: number; total: number } | null | undefined,
  now: { completed: number; total: number } | null | undefined,
): CorrectionCheck | null {
  if (kind === "window" || !at || !now) return null;
  const total = Math.max(0, Math.round(now.total) - Math.round(at.total));
  const completed = Math.max(0, Math.min(total, Math.round(now.completed) - Math.round(at.completed)));
  if (total < CORRECTION_CHECK_MIN) {
    return {
      verdict: "too_early",
      since_total: total,
      since_completed: completed,
      line: total === 0 ? "No related tasks since you corrected this. Too early to tell." : `Only ${total} related ${total === 1 ? "task" : "tasks"} since you corrected this. Too early to tell.`,
    };
  }
  const rate = completed / total;
  const counts = `${completed} of ${total} related tasks finished since you corrected this`;
  // Avoidance corrected: finishing the work supports the founder. Strength corrected: finishing it supports the original belief.
  const supportsFounder = kind === "avoidance" ? rate >= 0.6 : rate <= 0.4;
  const againstFounder = kind === "avoidance" ? rate <= 0.34 : rate >= 0.7;
  if (supportsFounder) return { verdict: "holding", since_total: total, since_completed: completed, line: `${counts}. Your correction is holding.` };
  if (againstFounder) return { verdict: "not_holding", since_total: total, since_completed: completed, line: `${counts}. That still points to the original belief, so it may be right.` };
  return { verdict: "mixed", since_total: total, since_completed: completed, line: `${counts}. Mixed so far.` };
}
