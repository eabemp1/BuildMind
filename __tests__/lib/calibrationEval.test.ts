import { describe, it, expect } from "vitest";
import { evaluateCalibration, pairFromLearningRow, MIN_PAIRS, type PredictionPair } from "@/lib/calibrationEval";

const make = (n: number, f: (i: number) => PredictionPair) => Array.from({ length: n }, (_, i) => f(i));

describe("evaluateCalibration", () => {
  it("refuses a verdict on too little data", () => {
    const r = evaluateCalibration(make(MIN_PAIRS - 1, () => ({ predicted: 0.7, success: true })));
    expect(r.verdict).toBe("insufficient_data");
    expect(r.brier).toBeNull();
  });
  it("rewards a model that separates wins from losses", () => {
    const pairs = make(40, (i) => (i % 2 ? { predicted: 0.85, success: true } : { predicted: 0.15, success: false }));
    const r = evaluateCalibration(pairs);
    expect(r.verdict).toBe("beats_baseline");
    expect(r.skill!).toBeGreaterThan(0.5);
    expect(r.calibration_error!).toBeLessThan(0.2);
  });
  it("says so when it is no better than the average", () => {
    // Always says 50% while half succeed: same as the base rate.
    const r = evaluateCalibration(make(40, (i) => ({ predicted: 0.5, success: i % 2 === 0 })));
    expect(r.verdict).toBe("no_better_than_baseline");
  });
  it("flags a model that is confidently wrong", () => {
    const r = evaluateCalibration(make(40, (i) => (i % 2 ? { predicted: 0.9, success: false } : { predicted: 0.1, success: true })));
    expect(r.verdict).toBe("worse_than_baseline");
    expect(r.summary).toMatch(/should not be trusted/);
  });
  it("puts probability 1.0 in the top bin and ignores junk", () => {
    const r = evaluateCalibration([...make(25, () => ({ predicted: 1, success: true })), { predicted: NaN, success: true } as PredictionPair]);
    expect(r.n).toBe(25);
    expect(r.bins.at(-1)?.n).toBe(25);
  });
});

describe("pairFromLearningRow", () => {
  it("builds a pair from a resolved row", () => {
    expect(pairFromLearningRow({ outcome: "completed", evidence_match_score: 0.75, decision_rationale: { scores: { predicted_success: 62 } } })).toEqual({ predicted: 0.62, success: true });
    expect(pairFromLearningRow({ outcome: "completed", evidence_match_score: 0.25, decision_rationale: { scores: { predicted_success: 62 } } })?.success).toBe(false);
  });
  it("skips unresolved rows and rows without a stated probability", () => {
    expect(pairFromLearningRow({ outcome: "pending", evidence_match_score: null, decision_rationale: { scores: { predicted_success: 60 } } })).toBeNull();
    expect(pairFromLearningRow({ outcome: "completed", evidence_match_score: 0.9, decision_rationale: {} })).toBeNull();
  });
});
