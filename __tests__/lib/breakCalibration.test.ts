import { describe, it, expect } from "vitest";
import { buildEvidenceLayer, type EvidenceInput } from "@/lib/breakEvidence";
import {
  extractTests, summarizeTrackRecord, applyTrackRecord, MIN_RESOLVED_TO_ADJUST,
  type PredictedTest, type TestStatus,
} from "@/lib/breakCalibration";

const market = { market_size_signal: "large", demand_authenticity: "real", growth_trajectory: "growing", demand_signals: ["x"], demand_gaps: [], target_customer_fit: "", confidence: 0.8, reasoning: "" } as const;
const sentiment = { pain_intensity: "low", user_pain_points: ["Slow"], demand_signals: [], community_signals: [], willingness_to_pay_signal: "unlikely", confidence: 0.3, reasoning: "" } as const;
const competitor = { saturation_level: "low", direct_competitors: [{ name: "Acme", url: "https://www.acme.com", weakness: "Pricey", threat_level: "high" }], indirect_competitors: [], market_gaps: [], differentiation_opportunities: [], competitive_moat_score: 4, confidence: 0.6, reasoning: "" } as const;
const layer = () => buildEvidenceLayer({
  viabilityScore: 60,
  parsed: { problem: "Founders stall", target_customer: "solo founders", monetization: "subscription" },
  market: market as never, competitor: competitor as never, trend: null, sentiment: sentiment as never, risk: null,
  agentsSucceeded: 4, scraped: [], competitorSource: "tavily",
} as EvidenceInput);

const t = (status: TestStatus, p = 0.7, i = 0): PredictedTest => ({
  id: `t${i}-${status}`, component: "demand", assumption: "a", test: "b", provenWrongIf: "c", predictedHold: p, status,
});
const many = (n: number, status: TestStatus, p = 0.7) => Array.from({ length: n }, (_, i) => t(status, p, i));

describe("extractTests", () => {
  it("returns open predictions with ids and probabilities in range", () => {
    const tests = extractTests(layer());
    expect(tests.length).toBeGreaterThan(0);
    for (const x of tests) {
      expect(x.id).toBeTruthy();
      expect(x.status).toBe("open");
      expect(x.predictedHold).toBeGreaterThan(0);
      expect(x.predictedHold).toBeLessThan(1);
    }
    expect(new Set(tests.map((x) => x.id)).size).toBe(tests.length);
  });
});

describe("summarizeTrackRecord", () => {
  it("reports no data and does not adjust", () => {
    const r = summarizeTrackRecord([]);
    expect(r.grade).toBe("no_data");
    expect(r.adjustment.applied).toBe(false);
  });
  it("waits for results when only open predictions exist", () => {
    const r = summarizeTrackRecord(many(3, "open"));
    expect(r.grade).toBe("no_data");
    expect(r.open).toBe(3);
    expect(r.summary).toMatch(/waiting for a result/);
  });
  it("stays 'early' under the minimum and never adjusts", () => {
    const r = summarizeTrackRecord(many(MIN_RESOLVED_TO_ADJUST - 1, "refuted", 0.9));
    expect(r.grade).toBe("early");
    expect(r.adjustment.applied).toBe(false);
    expect(r.bias).toBeGreaterThan(0.5);
  });
  it("ignores inconclusive results in the score", () => {
    const r = summarizeTrackRecord([...many(2, "inconclusive"), ...many(6, "supported", 0.7)]);
    expect(r.resolved).toBe(6);
    expect(r.inconclusive).toBe(2);
    expect(r.observed).toBe(1);
  });
  it("flags overconfidence and adjusts", () => {
    const r = summarizeTrackRecord([...many(2, "supported", 0.8), ...many(4, "refuted", 0.8)]);
    expect(r.grade).toBe("overconfident");
    expect(r.adjustment.applied).toBe(true);
    expect(r.adjustment.bandMultiplier).toBeGreaterThan(1);
    expect(r.adjustment.confidencePointShift).toBeLessThan(0);
  });
  it("flags underconfidence", () => {
    const r = summarizeTrackRecord(many(6, "supported", 0.4));
    expect(r.grade).toBe("underconfident");
    expect(r.adjustment.bandMultiplier).toBeLessThan(1);
    expect(r.adjustment.confidencePointShift).toBeGreaterThan(0);
  });
  it("calls close predictions calibrated and changes nothing", () => {
    const r = summarizeTrackRecord([...many(4, "supported", 0.7), ...many(2, "refuted", 0.7)]);
    expect(r.grade).toBe("calibrated");
    expect(r.adjustment.applied).toBe(false);
  });
  it("breaks results down by component", () => {
    const r = summarizeTrackRecord([{ ...t("refuted", 0.8, 1), component: "risk" }, ...many(5, "supported", 0.7)]);
    expect(r.byComponent.risk?.n).toBe(1);
    expect(r.byComponent.demand?.n).toBe(5);
  });
});

describe("applyTrackRecord", () => {
  it("attaches the record but leaves numbers alone when not applied", () => {
    const l = layer();
    const out = applyTrackRecord(l, summarizeTrackRecord([]));
    expect(out.confidence).toEqual(l.confidence);
    expect(out.trackRecord?.grade).toBe("no_data");
  });
  it("widens the range and lowers the conclusion when past runs were optimistic", () => {
    const l = layer();
    const track = summarizeTrackRecord([...many(1, "supported", 0.85), ...many(6, "refuted", 0.85)]);
    const out = applyTrackRecord(l, track);
    expect(out.confidence.high - out.confidence.low).toBeGreaterThan(l.confidence.high - l.confidence.low);
    expect(out.confidence.score).toBe(l.confidence.score);
    expect(out.confidence.why).toMatch(/track record/);
    if (l.conclusion && out.conclusion) expect(out.conclusion.pct).toBeLessThan(l.conclusion.pct);
  });
  it("keeps the band within 0-100", () => {
    const track = summarizeTrackRecord(many(8, "refuted", 0.95));
    const out = applyTrackRecord(layer(), track);
    expect(out.confidence.low).toBeGreaterThanOrEqual(0);
    expect(out.confidence.high).toBeLessThanOrEqual(100);
  });
});
