/**
 * lib/calibrationEval.ts - is BuildMind's "chance this works for you" actually right?
 *
 * Each Today recommendation stores a predicted success probability (decision_rationale.scores
 * .predicted_success). When the founder reports the outcome we know whether it worked. This module
 * compares the two:
 *
 *   Brier score         mean squared error of the probabilities (lower is better, 0.25 = always saying 50%)
 *   Baseline Brier      what you would score by always predicting the overall success rate
 *   Skill               1 - brier/baseline. Above 0 means the model beats "just use the average".
 *   Calibration error   how far, on average, a stated 70% is from the 70% that actually happened
 *   Reliability bins    stated probability bands vs what happened
 *
 * Below MIN_PAIRS resolved predictions it refuses to give a verdict instead of dressing noise up as a
 * number. Pure; scripts/eval-calibration.ts feeds it real rows.
 */

export interface PredictionPair {
  /** 0-1 stated probability of success. */
  predicted: number;
  success: boolean;
}

export interface ReliabilityBin {
  from: number;
  to: number;
  n: number;
  mean_predicted: number;
  observed_rate: number;
}

export interface CalibrationReport {
  n: number;
  verdict: "insufficient_data" | "beats_baseline" | "no_better_than_baseline" | "worse_than_baseline";
  base_rate: number | null;
  brier: number | null;
  baseline_brier: number | null;
  skill: number | null;
  calibration_error: number | null;
  bins: ReliabilityBin[];
  summary: string;
}

export const MIN_PAIRS = 20;
const BINS = 5;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function evaluateCalibration(pairsIn: PredictionPair[]): CalibrationReport {
  const pairs = (pairsIn ?? []).filter((p) => p && Number.isFinite(p.predicted)).map((p) => ({ predicted: clamp01(p.predicted), success: Boolean(p.success) }));
  const n = pairs.length;
  if (n < MIN_PAIRS) {
    return { n, verdict: "insufficient_data", base_rate: null, brier: null, baseline_brier: null, skill: null, calibration_error: null, bins: [], summary: `Only ${n} resolved prediction${n === 1 ? "" : "s"}. At least ${MIN_PAIRS} are needed before accuracy means anything.` };
  }
  const successes = pairs.filter((p) => p.success).length;
  const base = successes / n;
  const brier = pairs.reduce((s, p) => s + (p.predicted - (p.success ? 1 : 0)) ** 2, 0) / n;
  const baseline = pairs.reduce((s, p) => s + (base - (p.success ? 1 : 0)) ** 2, 0) / n;
  const skill = baseline > 0 ? 1 - brier / baseline : 0;

  const bins: ReliabilityBin[] = [];
  let calibrationSum = 0;
  for (let i = 0; i < BINS; i++) {
    const lo = i / BINS;
    const hi = (i + 1) / BINS;
    const inBin = pairs.filter((p) => (i === BINS - 1 ? p.predicted >= lo && p.predicted <= hi : p.predicted >= lo && p.predicted < hi));
    if (!inBin.length) continue;
    const meanPred = inBin.reduce((s, p) => s + p.predicted, 0) / inBin.length;
    const obs = inBin.filter((p) => p.success).length / inBin.length;
    bins.push({ from: lo, to: hi, n: inBin.length, mean_predicted: r3(meanPred), observed_rate: r3(obs) });
    calibrationSum += Math.abs(meanPred - obs) * inBin.length;
  }
  const ece = calibrationSum / n;

  const verdict: CalibrationReport["verdict"] = skill > 0.05 ? "beats_baseline" : skill < -0.05 ? "worse_than_baseline" : "no_better_than_baseline";
  const summary =
    verdict === "beats_baseline"
      ? `Across ${n} resolved predictions BuildMind beats guessing the average (skill ${r3(skill)}). Stated odds are off by ${Math.round(ece * 100)} points on average.`
      : verdict === "worse_than_baseline"
        ? `Across ${n} resolved predictions BuildMind does worse than guessing the average (skill ${r3(skill)}). Its success odds should not be trusted yet.`
        : `Across ${n} resolved predictions BuildMind is no better than guessing the average. Its success odds carry little information yet.`;
  return { n, verdict, base_rate: r3(base), brier: r3(brier), baseline_brier: r3(baseline), skill: r3(skill), calibration_error: r3(ece), bins, summary };
}

/** Turn a resolved learning-log row into a pair. Null when the row has no stated probability or is unresolved. */
export function pairFromLearningRow(row: {
  outcome?: string | null;
  evidence_match_score?: number | null;
  decision_rationale?: { scores?: { predicted_success?: number } } | null;
}): PredictionPair | null {
  const p = row.decision_rationale?.scores?.predicted_success;
  if (typeof p !== "number" || !Number.isFinite(p)) return null;
  if (row.evidence_match_score == null || !row.outcome || row.outcome === "pending") return null;
  return { predicted: clamp01(p / 100), success: row.outcome === "completed" && (row.evidence_match_score ?? 0) >= 0.5 };
}
