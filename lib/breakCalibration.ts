/**
 * lib/breakCalibration.ts — makes Break My Startup's numbers earn trust.
 *
 * Every analysis makes testable predictions: "this assumption holds with
 * probability p". The founder later runs the test and records what happened.
 * This module scores those predictions against outcomes, and reports whether
 * the analyses have been too optimistic, too pessimistic or well calibrated.
 * Once there is enough history it also adjusts the next analysis: wider
 * ranges and a lower headline confidence when the past ones ran hot.
 *
 * Pure: no I/O, no model calls. Persistence lives in
 * lib/server/breakPredictions.ts.
 *
 * Honest limits: results are self-reported, samples are small, and one
 * founder's record says nothing about another's. The module says so instead
 * of showing a precise-looking number too early.
 */

import type { EvidenceLayer, TestComponent } from "@/lib/breakEvidence";

export type TestStatus = "open" | "supported" | "refuted" | "inconclusive";

export interface PredictedTest {
  id: string;
  component: TestComponent;
  assumption: string;
  test: string;
  provenWrongIf: string;
  /** Predicted chance the assumption holds, 0-1. */
  predictedHold: number;
  status: TestStatus;
  note?: string;
  resolvedAt?: string;
}

/** The minimum resolved tests before a track record may change anything. */
export const MIN_RESOLVED_TO_ADJUST = 5;
/** Under this much average miss, the numbers are called calibrated. */
const BIAS_TOLERANCE = 0.12;

export interface ComponentRecord { n: number; predicted: number; observed: number; bias: number }

export interface TrackRecord {
  /** Tests with a decisive result (supported or refuted). */
  resolved: number;
  open: number;
  inconclusive: number;
  /** Mean squared error of predictions, 0 (perfect) to 1. A coin flip scores 0.25. */
  brier: number | null;
  meanPredicted: number | null;
  observed: number | null;
  /** meanPredicted - observed. Positive means past analyses were too optimistic. */
  bias: number | null;
  grade: "no_data" | "early" | "calibrated" | "overconfident" | "underconfident";
  byComponent: Partial<Record<TestComponent, ComponentRecord>>;
  summary: string;
  /** How the next analysis is changed by this record. 1 and 0 mean unchanged. */
  adjustment: { bandMultiplier: number; confidencePointShift: number; applied: boolean };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The testable predictions inside one analysis. */
export function extractTests(layer: EvidenceLayer): PredictedTest[] {
  const out: PredictedTest[] = [];
  for (const f of layer.falsifiers) {
    if (!f.id || !f.component || typeof f.predictedHold !== "number") continue;
    out.push({
      id: f.id, component: f.component, assumption: f.assumption, test: f.test,
      provenWrongIf: f.provenWrongIf, predictedHold: f.predictedHold, status: "open",
    });
  }
  const t = layer.thesisTest;
  if (t?.id && typeof t.predictedHold === "number") {
    out.push({
      id: t.id, component: "uniqueness", assumption: `Your differentiator works: ${t.thesis}`,
      test: t.setup, provenWrongIf: "Existing tools solve the hard test cases about as well as yours does.",
      predictedHold: t.predictedHold, status: "open",
    });
  }
  return out;
}

export function summarizeTrackRecord(tests: PredictedTest[]): TrackRecord {
  const decisive = tests.filter((t) => t.status === "supported" || t.status === "refuted");
  const open = tests.filter((t) => t.status === "open").length;
  const inconclusive = tests.filter((t) => t.status === "inconclusive").length;
  const n = decisive.length;

  const empty: TrackRecord = {
    resolved: n, open, inconclusive, brier: null, meanPredicted: null, observed: null, bias: null,
    grade: "no_data", byComponent: {}, summary: "",
    adjustment: { bandMultiplier: 1, confidencePointShift: 0, applied: false },
  };
  if (n === 0) {
    return { ...empty, summary: open > 0
      ? `${open} prediction${open === 1 ? " is" : "s are"} waiting for a result. Run the test and record what happened, and these numbers start to mean something.`
      : "No predictions have been tested yet." };
  }

  const y = (t: PredictedTest) => (t.status === "supported" ? 1 : 0);
  const meanPredicted = decisive.reduce((s, t) => s + t.predictedHold, 0) / n;
  const observed = decisive.reduce((s, t) => s + y(t), 0) / n;
  const brier = decisive.reduce((s, t) => s + (t.predictedHold - y(t)) ** 2, 0) / n;
  const bias = meanPredicted - observed;

  const byComponent: TrackRecord["byComponent"] = {};
  for (const comp of ["demand", "monetization", "competition", "uniqueness", "risk"] as TestComponent[]) {
    const rows = decisive.filter((t) => t.component === comp);
    if (rows.length === 0) continue;
    const p = rows.reduce((s, t) => s + t.predictedHold, 0) / rows.length;
    const o = rows.reduce((s, t) => s + y(t), 0) / rows.length;
    byComponent[comp] = { n: rows.length, predicted: r2(p), observed: r2(o), bias: r2(p - o) };
  }

  let grade: TrackRecord["grade"];
  if (n < MIN_RESOLVED_TO_ADJUST) grade = "early";
  else if (bias > BIAS_TOLERANCE) grade = "overconfident";
  else if (bias < -BIAS_TOLERANCE) grade = "underconfident";
  else grade = "calibrated";

  const adjusting = grade === "overconfident" || grade === "underconfident";
  const adjustment = adjusting
    ? {
        bandMultiplier: r2(grade === "overconfident" ? 1 + Math.min(0.8, Math.abs(bias) * 2) : 1 - Math.min(0.3, Math.abs(bias))),
        confidencePointShift: Math.round((grade === "overconfident" ? -1 : 1) * Math.min(20, Math.abs(bias) * 40)),
        applied: true,
      }
    : { bandMultiplier: 1, confidencePointShift: 0, applied: false };

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const summary =
    grade === "early"
      ? `${n} of your predictions have a result so far. The analysis expected ${pct(meanPredicted)} of them to hold and ${pct(observed)} did. That is too few to adjust anything yet. ${MIN_RESOLVED_TO_ADJUST - n} more results unlock adjustment.`
      : grade === "calibrated"
        ? `Across ${n} tested predictions the analysis expected ${pct(meanPredicted)} to hold and ${pct(observed)} did. For you, these numbers have been about right.`
        : grade === "overconfident"
          ? `Across ${n} tested predictions the analysis expected ${pct(meanPredicted)} to hold but only ${pct(observed)} did. It has been too optimistic for you, so ranges are widened and confidence is lowered to compensate.`
          : `Across ${n} tested predictions the analysis expected ${pct(meanPredicted)} to hold and ${pct(observed)} did. It has been too cautious for you, so ranges are tightened slightly.`;

  return { resolved: n, open, inconclusive, brier: r2(brier), meanPredicted: r2(meanPredicted), observed: r2(observed), bias: r2(bias), grade, byComponent, summary, adjustment };
}

/** Applies the track record to a fresh analysis. Unchanged below the minimum sample. */
export function applyTrackRecord(layer: EvidenceLayer, track: TrackRecord): EvidenceLayer {
  const next: EvidenceLayer = { ...layer, trackRecord: track };
  if (!track.adjustment.applied) return next;

  const { bandMultiplier, confidencePointShift } = track.adjustment;
  const c = layer.confidence;
  const half = Math.max(1, ((c.high - c.low) / 2) * bandMultiplier);
  next.confidence = {
    ...c,
    low: Math.max(0, Math.round(c.score - half)),
    high: Math.min(100, Math.round(c.score + half)),
    why: `${c.why} Adjusted for your track record: ${track.grade === "overconfident" ? "past analyses ran optimistic" : "past analyses ran cautious"}.`,
  };
  if (layer.conclusion) {
    const pct = clamp(layer.conclusion.pct + confidencePointShift, 5, 95);
    next.conclusion = { ...layer.conclusion, pct, label: pct >= 65 ? "High" : pct >= 40 ? "Moderate" : "Low" };
  }
  return next;
}
