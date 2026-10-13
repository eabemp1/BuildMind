import { describe, it, expect } from "vitest";
import { computeCrewStats, computeEvidenceMix, caseNumber } from "@/lib/agentWorkspace";

const run = (id: string, agent: any, over: any = {}) => ({ id, agent_type: agent, status: "complete", verdict: "proceed", confidence_pct: 70, signals_found: 4, started_at: "2026-10-01T00:00:00Z", completed_at: null, ...over });

describe("agent workspace stats", () => {
  it("computes per-agent track record from real runs only", () => {
    const stats = computeCrewStats(
      [run("a", "research", { confidence_pct: 60 }), run("b", "research", { confidence_pct: 80, started_at: "2026-10-05T00:00:00Z", verdict: "pivot" }), run("c", "validation", { status: "error" })],
      [{ id: "1", run_id: "a", iteration: 1, positive: true, confidence: 0.8, founder_confirmed: true }, { id: "2", run_id: "b", iteration: 1, positive: false, confidence: 0.5, founder_confirmed: false }, { id: "3", run_id: "b", iteration: 2, positive: true, confidence: 0.5, founder_confirmed: null }],
    );
    expect(stats.research.avgConfidence).toBe(70);
    expect(stats.research.lastVerdict).toBe("pivot");
    expect(stats.research.confirmRate).toBe(50);
    expect(stats.validation.completed).toBe(0);
    expect(stats.validation.avgConfidence).toBeNull();
    expect(stats.competitor.runs).toBe(0);
    expect(stats.research.trail.map((t) => t.id)).toEqual(["a", "b"]);
  });
  it("mixes evidence by cycle", () => {
    const m = computeEvidenceMix([{ id: "1", iteration: 1, positive: true, confidence: 0.9, founder_confirmed: null }, { id: "2", iteration: 1, positive: false, confidence: 0.5, founder_confirmed: true }]);
    expect(m).toMatchObject({ total: 2, positive: 1, negative: 1, pending: 1, confirmed: 1, avgConfidence: 70 });
    expect(m.byCycle).toEqual([{ cycle: 1, positive: 1, negative: 1 }]);
    expect(caseNumber("ab-cd12345")).toBe("CASE-ABCD1");
  });
});
