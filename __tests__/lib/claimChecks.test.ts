import { describe, it, expect } from "vitest";
import { applyReview, checkCounts, effectiveClaim, findCheck, settledLines, settledStatus, upsertCheck, type SavedCheck } from "@/lib/break/claimChecks";
import { buildEvidenceLayer, evidenceQuality, gradeCompetitors, type EvidenceInput } from "@/lib/breakEvidence";

const finding = (id: string, positive: boolean, confirmed: boolean | null, tier: "signal" | "supported" | "decision_grade" = "supported") =>
  ({ id, title: "t", evidence: "e", positive, confidence: 0.7, sources: ["https://a.com", "https://b.com"], counter_evidence: null, tier, confirmed });
const check = (focus: string, status: SavedCheck["status"], findings: SavedCheck["findings"], runId = "r1"): SavedCheck =>
  ({ runId, focus, agentType: "research", status, completedAt: null, findings });

describe("claim checks", () => {
  it("settles only when a well-sourced finding that agrees with the status was confirmed", () => {
    expect(settledStatus(check("Founders pay", "supported", [finding("a", true, true)]))).toBe("supported");
    expect(settledStatus(check("Founders pay", "supported", [finding("a", true, null)]))).toBeNull();
    expect(settledStatus(check("Founders pay", "supported", [finding("a", true, true, "signal")]))).toBeNull();
    expect(settledStatus(check("Founders pay", "contradicted", [finding("a", false, true)]))).toBe("contradicted");
    expect(settledStatus(check("Founders pay", "mixed", [finding("a", true, true)]))).toBeNull();
    expect(settledStatus(undefined)).toBeNull();
  });
  it("relabels a confirmed supported claim as evidence and flags a contradicted one", () => {
    const checks = [check("Founders pay for this", "supported", [finding("a", true, true)]), check("Market is huge", "contradicted", [finding("b", false, true)], "r2")];
    expect(effectiveClaim({ claim: "Founders pay for this.", kind: "inference", source: "x" }, checks).kind).toBe("evidence");
    const c = effectiveClaim({ claim: "Market is huge", kind: "inference", source: "x" }, checks);
    expect(c.kind).toBe("inference");
    expect(c.contradicted).toBe(true);
    expect(effectiveClaim({ claim: "Unrelated claim here", kind: "hypothesis", source: "x" }, checks).kind).toBe("hypothesis");
  });
  it("upsert replaces the same claim; review updates one finding", () => {
    const a = check("Same claim here", "unverified", [finding("a", true, null)]);
    const b = check("same claim here.", "supported", [finding("b", true, null)], "r2");
    expect(upsertCheck([a], b)).toHaveLength(1);
    const reviewed = applyReview([b], "r2", "b", true);
    expect(findCheck(reviewed, "Same claim here")?.findings[0].confirmed).toBe(true);
    expect(checkCounts(reviewed)).toEqual({ checked: 1, settled: 1 });
  });
  it("prompt lines carry only settled checks", () => {
    const lines = settledLines([check("Founders pay", "supported", [finding("a", true, true)]), check("Other claim here", "supported", [finding("b", true, null)], "r2")]);
    expect(lines).toEqual(["CONFIRMED by the founder from sources: Founders pay"]);
  });
});

const base: EvidenceInput = { viabilityScore: 60, market: null, competitor: null, trend: null, sentiment: null, risk: null, agentsSucceeded: 3, scraped: [], competitorSource: "none" };

describe("settled checks in the evidence layer", () => {
  const settled = [check("Founders pay for this", "supported", [finding("a", true, true)])];
  it("adds an evidence claim and raises quality, modestly", () => {
    const layer = buildEvidenceLayer({ ...base, checkedClaims: settled });
    expect(layer.claims.some((c) => c.kind === "evidence" && /confirmed by you/.test(c.source))).toBe(true);
    const q0 = evidenceQuality(base, gradeCompetitors(base));
    const q1 = evidenceQuality({ ...base, checkedClaims: settled }, gradeCompetitors(base));
    expect(q1).toBeGreaterThan(q0);
    expect(q1 - q0).toBeLessThan(0.1);
  });
  it("ignores unconfirmed checks", () => {
    const open = [check("Founders pay for this", "supported", [finding("a", true, null)])];
    expect(evidenceQuality({ ...base, checkedClaims: open }, gradeCompetitors(base))).toBe(evidenceQuality(base, gradeCompetitors(base)));
  });
});
