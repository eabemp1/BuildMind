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
