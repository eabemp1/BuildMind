import { describe, it, expect } from "vitest";
import { buildEvidenceLayer, type EvidenceInput } from "@/lib/breakEvidence";
import { productDemandScore, marketDemandScore, notACompetitorReason, buildNextMove } from "@/lib/breakEvidenceV3";

const market = { market_size_signal: "large", demand_authenticity: "real", growth_trajectory: "growing", demand_signals: ["Many posts ask for this"], demand_gaps: [], target_customer_fit: "", confidence: 0.8, reasoning: "" } as const;
const sentiment = { pain_intensity: "medium", user_pain_points: ["Slow"], demand_signals: [], community_signals: ["r/startups thread"], willingness_to_pay_signal: "possible", confidence: 0.5, reasoning: "" } as const;
const competitor = { saturation_level: "medium", direct_competitors: [
  { name: "Acme", url: "https://www.acme.com", weakness: "Pricey", threat_level: "high" },
  { name: "BuildMind", url: "https://buildmind.live", weakness: "", threat_level: "low" },
], indirect_competitors: ["OKR Tools (Generic Category)"], market_gaps: [], differentiation_opportunities: ["Adaptive task size"], competitive_moat_score: 4, confidence: 0.6, reasoning: "" } as const;
const risk = { top_risks: [{ title: "Founders will not pay", description: "", severity: "high", mitigation: "Ask for deposits" }], blind_spots: [], failure_modes: [], execution_risk_level: "high", confidence: 0.4, reasoning: "" } as const;
const breakdown = [
  { key: "demand", label: "Market Demand", score: 76, weight: "30%" },
  { key: "risk", label: "Risk", score: 98, weight: "10%" },
];
const base = (o: Partial<EvidenceInput> = {}): EvidenceInput => ({
  viabilityScore: 59,
  parsed: { problem: "Founders stall", target_customer: "solo founders", monetization: "subscription" },
  market: market as never, competitor: competitor as never, trend: null, sentiment: sentiment as never, risk: risk as never,
  agentsSucceeded: 4, scraped: [{ title: "Best execution tools | Product Hunt", url: "https://www.producthunt.com/topics/x", snippet: "" }],
  competitorSource: "tavily", productName: "BuildMind", breakdown, ...o,
});

describe("market demand vs product demand", () => {
  it("holds product demand low without customer evidence", () => {
    expect(marketDemandScore(base())).toBe(76);
    expect(productDemandScore(base())).toBeLessThanOrEqual(35);
  });
  it("lifts the ceiling with the founder's own evidence but never past the market", () => {
    const withEv = productDemandScore(base({ founderEvidenceCount: 4 }));
    expect(withEv).toBeGreaterThan(35);
    expect(withEv).toBeLessThanOrEqual(76);
  });
  it("feeds the demand prediction the product figure, not the market one", () => {
    const f = buildEvidenceLayer(base()).falsifiers.find(x => x.component === "demand");
    expect(f?.predictedHold).toBeLessThanOrEqual(0.35);
  });
});

describe("risk is exposure plus uncertainty", () => {
  it("reports exposure from named risks and high uncertainty with no customer evidence", () => {
    const r = buildEvidenceLayer(base()).riskExposure;
    expect(r?.exposure).toBe("Moderate");
    expect(r?.uncertainty).toBe("High");
  });
  it("renames the risk score as resilience", () => {
    const c = buildEvidenceLayer(base()).scoreBasis?.components.find(x => x.key === "risk");
    expect(c?.label).toMatch(/higher is safer/i);
  });
});

describe("competitor hygiene", () => {
  it("excludes the founder's own product, categories and directory pages", () => {
    const layer = buildEvidenceLayer(base());
    const names = layer.competitors.map(c => c.name.toLowerCase());
    expect(names).toContain("acme");
    expect(names.some(n => n.includes("buildmind"))).toBe(false);
    expect(names.some(n => n.includes("generic category"))).toBe(false);
    expect(names.some(n => n.includes("product hunt"))).toBe(false);
    expect(layer.excludedCompetitors?.length).toBeGreaterThanOrEqual(3);
  });
  it("keeps real competitors", () => {
    expect(notACompetitorReason("Acme", "https://acme.com", "BuildMind")).toBeNull();
  });
});

describe("the next move follows the diagnosis", () => {
  it("says interview, and not to build, while demand is unproven", () => {
    const m = buildEvidenceLayer(base()).nextMove!;
    expect(m.holdBuilding).toBe(true);
    expect(m.action).toMatch(/Interview 8/);
    expect(m.doNotBuildYet.join(" ")).toMatch(/roadmap/i);
  });
  it("moves on to the riskiest test once demand has direct support", () => {
    const m = buildNextMove(base({ founderEvidenceCount: 6, sentiment: { ...sentiment, willingness_to_pay_signal: "likely" } as never }), buildEvidenceLayer(base()).falsifiers);
    expect(m.holdBuilding).toBe(false);
  });
});

describe("hypotheses and evidence levels", () => {
  it("splits the idea into eight bets and caps confidence without customers", () => {
    const hs = buildEvidenceLayer(base()).hypotheses!;
    expect(hs.map(h => h.id)).toEqual(["customer", "problem", "frequency", "willingness_to_pay", "solution", "differentiation", "distribution", "economics"]);
    expect(hs.every(h => h.confidence <= 0.35)).toBe(true);
    expect(hs.every(h => h.status !== "supported")).toBe(true);
    expect(hs.every(h => h.falsifier.length > 10 && h.nextExperiment.length > 10)).toBe(true);
  });
  it("states that level 1 evidence is absent", () => {
    const h = buildEvidenceLayer(base()).evidenceHierarchy!;
    expect(h.levels[0].count).toBe(0);
    expect(h.statement).toMatch(/Level 1 evidence/);
  });
});
