import { describe, it, expect } from "vitest";
import { mergeSignals, snap5 } from "@/lib/agents";

const competitor = (gaps: number, moat = 6): any => ({ saturation_level: "medium", competitive_moat_score: moat, market_gaps: Array.from({ length: gaps }, (_, i) => `gap ${i}`), differentiation_opportunities: [], confidence: 0.7 });
const market: any = { demand_authenticity: "real", demand_gaps: [], confidence: 0.7 };
const sentiment: any = { pain_intensity: "medium", willingness_to_pay_signal: "possible", user_pain_points: [], demand_signals: [], confidence: 0.6 };
const trend: any = { timing_signal: "early", macro_tailwinds: [], confidence: 0.6 };
const risk: any = { execution_risk_level: "medium", top_risks: [], confidence: 0.6 };

describe("snap5", () => {
  it("rounds to the nearest 5 and stays in range", () => {
    expect(snap5(62)).toBe(60);
    expect(snap5(63)).toBe(65);
    expect(snap5(-4)).toBe(0);
    expect(snap5(103)).toBe(100);
  });
});

describe("mergeSignals stability", () => {
  it("shows every score in steps of 5", () => {
    const s = mergeSignals(market, competitor(3), trend, sentiment, risk);
    for (const k of ["demand_score", "competition_score", "timing_score", "uniqueness_score", "risk_score"] as const) expect(s[k] % 5).toBe(0);
  });
  it("does not move when the model lists 3 gaps one run and 5 the next", () => {
    expect(mergeSignals(market, competitor(3), trend, sentiment, risk).uniqueness_score)
      .toBe(mergeSignals(market, competitor(5), trend, sentiment, risk).uniqueness_score);
  });
  it("still tells apart no gaps from some gaps", () => {
    expect(mergeSignals(market, competitor(0), trend, sentiment, risk).uniqueness_score)
      .toBeLessThan(mergeSignals(market, competitor(3), trend, sentiment, risk).uniqueness_score);
  });
});
