import { describe, it, expect } from "vitest";
import { buildEvidenceLayer, type EvidenceInput } from "@/lib/breakEvidence";

const market = { market_size_signal: "large", demand_authenticity: "real", growth_trajectory: "growing", demand_signals: ["Many posts ask for this"], demand_gaps: [], target_customer_fit: "", confidence: 0.8, reasoning: "" } as const;
const sentiment = { pain_intensity: "low", user_pain_points: ["Slow"], demand_signals: [], community_signals: [], willingness_to_pay_signal: "unlikely", confidence: 0.3, reasoning: "" } as const;
const competitor = { saturation_level: "low", direct_competitors: [{ name: "Acme", url: "https://www.acme.com", weakness: "Pricey", threat_level: "high" }], indirect_competitors: ["Spreadsheets"], market_gaps: [], differentiation_opportunities: [], competitive_moat_score: 4, confidence: 0.6, reasoning: "" } as const;
const scraped = ["acme.com", "b.io", "c.io", "d.io", "e.io"].map(h => ({ title: h, url: `https://${h}/x`, snippet: "s" }));

const base = (o: Partial<EvidenceInput> = {}): EvidenceInput => ({
  viabilityScore: 39,
  parsed: { problem: "Founders stall", target_customer: "solo founders", monetization: "subscription" },
  market: market as never, competitor: competitor as never, trend: null, sentiment: sentiment as never, risk: null,
  agentsSucceeded: 4, scraped, competitorSource: "tavily", ...o,
});

describe("buildEvidenceLayer", () => {
  it("flags contradictions between agents and search", () => {
    const titles = buildEvidenceLayer(base()).conflicts.map(c => c.title).join("|");
    expect(titles).toMatch(/Competition/);
    expect(titles).toMatch(/Demand: people want it/);
    expect(titles).toMatch(/pain is mild/);
  });
  it("grades competitors by provenance", () => {
    const comps = buildEvidenceLayer(base()).competitors;
    expect(comps.find(c => c.name === "Acme")?.quality).toBe("verified");
    expect(comps.find(c => c.name === "Spreadsheets")?.quality).toBe("adjacent");
  });
  it("never calls AI-synthesised competitors verified", () => {
    const comps = buildEvidenceLayer(base({ competitorSource: "ai_synthesised" })).competitors;
    expect(comps.some(c => c.quality === "verified")).toBe(false);
  });
  it("widens the range when there is no customer evidence, narrows with it", () => {
    const thin = buildEvidenceLayer(base()).confidence;
    const rich = buildEvidenceLayer(base({ founderEvidenceCount: 6 })).confidence;
    expect(thin.high - thin.low).toBeGreaterThan(rich.high - rich.low);
    expect(thin.grade).toBe("thin");
    expect(thin.low).toBeLessThan(39);
    expect(thin.why).toMatch(/no customer evidence/);
  });
  it("labels founder statements as hypotheses, never evidence", () => {
    const claims = buildEvidenceLayer(base()).claims;
    expect(claims.filter(c => /^The problem is real/.test(c.claim))[0].kind).toBe("hypothesis");
    expect(claims.some(c => c.kind === "unknown")).toBe(true);
  });
  it("states what would prove the thesis wrong", () => {
    const f = buildEvidenceLayer(base()).falsifiers;
    expect(f.length).toBeGreaterThanOrEqual(2);
    expect(f.every(x => x.provenWrongIf.length > 10)).toBe(true);
  });
  it("clamps the band to 0-100", () => {
    const c = buildEvidenceLayer(base({ viabilityScore: 98 })).confidence;
    expect(c.high).toBeLessThanOrEqual(100);
  });
});

describe("evidence layer v2", () => {
  const mkt = { ...market, demand_signals: ["There is clear evidence of user frustration with file locate across platforms."], reasoning: "" };
  const sen = { ...sentiment, user_pain_points: [], reasoning: "There is no evidence in the supplied data of users actively complaining about being unable to find files they know they have." };
  const comp = { ...competitor, saturation_level: "medium", differentiation_opportunities: ["Reconstruct a lost file from indirect evidence such as emails, versions and metadata"] };
  const v2 = (o: Partial<EvidenceInput> = {}) => base({
    market: mkt as never, sentiment: sen as never, competitor: comp as never,
    parsed: { problem: "People cannot find or recover files they know existed", target_customer: "knowledge workers", monetization: "subscription" },
    breakdown: [
      { key: "demand", label: "Market Demand", score: 46, weight: "30%" },
      { key: "competition", label: "Competitive Position", score: 45, weight: "20%" },
      { key: "timing", label: "Market Timing", score: 55, weight: "15%" },
      { key: "uniqueness", label: "Differentiation", score: 26, weight: "20%" },
      { key: "monetization", label: "Monetization Clarity", score: 40, weight: "15%" },
    ],
    pivots: [
      { title: "Enterprise Data Decay Auditor", description: "Audit organisational records for compliance", target_niche: "compliance teams", key_change: "buyer" },
      { title: "Niche to knowledge workers who lose files", description: "Focus on people who cannot find files they know existed", target_niche: "knowledge workers", key_change: "Target audience" },
    ],
    ...o,
  });

  it("catches a text-level contradiction between Market and Sentiment", () => {
    const c = buildEvidenceLayer(v2()).conflicts.find(x => /one section reports evidence/.test(x.title));
    expect(c).toBeTruthy();
    expect(c!.howToSettle).toMatch(/broad frustration/);
  });
  it("does not invent a conflict when nothing is contradicted", () => {
    const calm = buildEvidenceLayer(v2({ sentiment: { ...sentiment, reasoning: "Users mention it often." } as never }));
    expect(calm.conflicts.some(x => /one section reports evidence/.test(x.title))).toBe(false);
  });
  it("explains where the score comes from and says it is uncalibrated", () => {
    const b = buildEvidenceLayer(v2()).scoreBasis!;
    expect(b.calibrated).toBe(false);
    expect(b.components).toHaveLength(5);
    expect(b.inferenceSharePct).toBeGreaterThan(50);
    expect(b.components.find(c => c.key === "uniqueness")!.kind).toBe("inference");
  });
  it("leads with conclusion confidence, uncertainty and required evidence", () => {
    const c = buildEvidenceLayer(v2()).conclusion!;
    expect(c.pct).toBeLessThanOrEqual(55);
    expect(c.primaryUncertainty).toMatch(/specific pain|knowledge workers/);
    expect(c.requiredEvidence.length).toBeGreaterThan(0);
  });
  it("designs the experiment around the differentiator, not the commodity", () => {
    const t = buildEvidenceLayer(v2()).thesisTest!;
    expect(t.thesis).toMatch(/Reconstruct/);
    expect(t.notThisTest).toMatch(/Do not test/);
    expect(t.measure.join(" ")).toMatch(/false positives/i);
    expect(t.ifItFails.length).toBeGreaterThan(20);
  });
  it("states what would change our mind in both directions", () => {
    const m = buildEvidenceLayer(v2()).changeMyMind!;
    expect(m.kills.length).toBeGreaterThan(2);
    expect(m.strengthens.length).toBeGreaterThan(2);
    expect(m.kills.join(" ")).toMatch(/Existing tools solve the hard test cases/);
  });
  it("says when a pivot does not validate the original idea", () => {
    const checks = buildEvidenceLayer(v2()).pivotChecks!;
    expect(checks.find(c => /Enterprise/.test(c.title))!.validatesOriginal).toBe(false);
    expect(checks.find(c => /Niche to knowledge/.test(c.title))!.relation).toBe("same_problem");
  });
});
