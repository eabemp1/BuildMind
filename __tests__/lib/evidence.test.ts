import { describe, it, expect } from "vitest";
import { classifyFinding, extractSources, runReadiness, frameVerdict, evidenceStrength, buildProvenance, type EvidenceInput } from "@/lib/evidence";

const web = (o: Partial<EvidenceInput> = {}): EvidenceInput => ({ signal_type: "demand_confirmed", positive: true, confidence: 0.7, evidence: "See https://a.com/x and https://www.b.org/y", source_type: "web_search", counter_evidence: "Some founders use spreadsheets instead.", ...o });

describe("evidence tiers", () => {
  it("extracts distinct domains", () => {
    expect(extractSources("x https://www.a.com/1 https://a.com/2", ["https://b.org"]).sort()).toEqual(["a.com", "b.org"]);
  });
  it("reasoning only is a signal", () => {
    const c = classifyFinding(web({ source_type: "reasoning", evidence: "pattern" }));
    expect(c.tier).toBe("signal");
    expect(c.caveat).toContain("no external source");
  });
  it("single source is a signal", () => {
    expect(classifyFinding(web({ evidence: "per https://a.com/x" })).caveat).toContain("single source");
  });
  it("two sources is supported, with counter-evidence and confidence is decision-grade", () => {
    expect(classifyFinding(web({ counter_evidence: null })).tier).toBe("supported");
    expect(classifyFinding(web()).tier).toBe("decision_grade");
  });
  it("absence claims need three sources and carry the search caveat", () => {
    const two = classifyFinding(web({ signal_type: "demand_absent", positive: false }));
    expect(two.tier).toBe("signal");
    expect(two.caveat).toContain("not evidence of absence");
    const three = classifyFinding(web({ signal_type: "demand_absent", positive: false, evidence: "https://a.com https://b.com https://c.com" }));
    expect(three.tier).not.toBe("signal");
  });
  it("pivot candidates never reach decision-grade", () => {
    expect(classifyFinding(web({ signal_type: "pivot_candidate" })).tier).toBe("supported");
  });
});

describe("readiness and framing", () => {
  it("one source stays in explore and softens a pivot", () => {
    const r = runReadiness([web({ evidence: "https://a.com", signal_type: "pivot_candidate" })]);
    expect(r.level).toBe("explore");
    expect(frameVerdict("pivot", r).label).toBe("Pivot worth testing");
    expect(frameVerdict("kill", r).strong).toBe(false);
  });
  it("two aligned decision-grade findings allow a decision", () => {
    const r = runReadiness([web(), web()]);
    expect(r.level).toBe("decide");
    expect(frameVerdict("pivot", r).label).toBe("Pivot recommended");
  });
  it("conflicting decision-grade findings means test", () => {
    expect(runReadiness([web(), web({ positive: false })]).level).toBe("test");
  });
  it("strength is separate from direction", () => {
    expect(evidenceStrength([web({ source_type: "reasoning" })])).toBe(20);
    expect(evidenceStrength([web()])).toBe(100);
    expect(evidenceStrength([])).toBe(0);
  });
});

describe("provenance", () => {
  it("unchecked signal stays an unverified hypothesis", () => {
    expect(buildProvenance("signal", 1, false).verification_status).toBe("unverified_hypothesis");
  });
  it("founder verification upgrades it", () => {
    const p = buildProvenance("signal", 1, true, "  talked to 3 founders  ");
    expect(p.verification_status).toBe("founder_verified");
    expect(p.confirm_note).toBe("talked to 3 founders");
  });
});
