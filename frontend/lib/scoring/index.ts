/**
 * lib/scoring/index.ts
 *
 * Startup score computation — extracted from lib/buildmind.ts.
 * Single responsibility: given project snapshot data, return a 0–100 score.
 *
 * Imported by:
 *   lib/buildmind.ts   (re-exported for backwards compatibility)
 *   app/today/page.tsx
 *   app/(dashboard)/dashboard/page.tsx
 */

export interface ScoringInput {
  progress?: number | null;
  validation_strengths?: string[] | null;
  execution_score?: number | null;
}

/**
 * computeStartupScore
 *
 * Weights:
 *   - execution_score from DB (AI-generated, 0-100)         → primary signal
 *   - milestone/task progress percentage                     → floor signal
 *   - number of validation strengths (×8 pts each, max 40)  → validation bonus
 *
 * Returns an integer 0–100.
 */
export function computeStartupScore(summary: ScoringInput): number {
  const base = summary.execution_score ?? 0;
  const strengthBoost = Math.min(40, (summary.validation_strengths ?? []).length * 8);
  const progress = summary.progress ?? 0;
  return Math.min(100, Math.round(Math.max(base, progress + strengthBoost)));
}

/**
 * computeScoreDelta
 *
 * Given an outcome and confidence level (1–5), returns how many points
 * should be added to or subtracted from the current score.
 */
export type Outcome = "completed" | "blocked" | "partial" | "learned";

export function computeScoreDelta(outcome: Outcome, confidence: number): number {
  if (outcome === "completed" && confidence >= 4) return 6;
  if (outcome === "completed") return 3;
  if (outcome === "partial" && confidence >= 3) return 1;
  if (outcome === "partial") return -2;
  if (outcome === "blocked") return -5;
  if (outcome === "learned") return 2;
  return 0;
}

/**
 * applyScoreDelta — clamps to [0, 100]
 */
export function applyScoreDelta(current: number, delta: number): number {
  return Math.min(100, Math.max(0, current + delta));
}
