import { describe, it, expect } from "vitest";
import { buildSharePayload, readSharePayload } from "@/lib/breakShare";

const result: any = {
  overallRisk: "High", summary: "x".repeat(500), survival_probability: 41.6,
  risks: [{ category: "Market", severity: "Low", description: "d", mitigation: "m" }, { category: "Demand", severity: "Critical", description: "no buyers", mitigation: "m" }],
  pivots: [{ title: "Niche down", why_better: "focus" }], founderStyle: { label: "secret", pace: "fast" },
  executionPlan: { mvp_roadmap: ["private"] }, evidence: { secret: true },
};

describe("break share payload", () => {
  it("keeps only the allow-listed summary, worst risk first", () => {
    const p = buildSharePayload(result, "My idea", new Date(0));
    expect(p.score).toBe(42);
    expect(p.risks[0].category).toBe("Demand");
    expect(p.summary.length).toBeLessThanOrEqual(320);
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/secret|private|founderStyle|executionPlan/);
  });
  it("shares the full report: every risk with its fix, competitors and pivots", () => {
    const full: any = {
      ...result,
      brutal_advice: "Talk to ten buyers before you write more code.",
      risks: Array.from({ length: 10 }, (_, i) => ({ category: `R${i}`, severity: "High", description: `risk ${i}`, mitigation: `fix ${i}` })),
      surviveReasons: ["a", "b", "c", "d", "e"],
      competitorTable: [{ name: "Rival", url: "https://rival.example", weakness: "slow", threat_level: "high" }],
      pivots: [{ title: "P1", why_better: "w", first_step: "s" }, { title: "P2", why_better: "w" }, { title: "P3", why_better: "w" }, { title: "P4", why_better: "w" }],
    };
    const p = buildSharePayload(full, "Idea");
    expect(p.full?.risks).toHaveLength(8);
    expect(p.full?.risks[0].fix).toMatch(/^fix/);
    expect(p.full?.survive).toHaveLength(4);
    expect(p.full?.competitors[0]).toEqual({ name: "Rival", weakness: "slow", threat: "high" });
    expect(p.full?.pivots).toHaveLength(3);
    expect(p.full?.advice).toMatch(/ten buyers/);
    // still private
    expect(JSON.stringify(p)).not.toMatch(/rival\.example|founderStyle|executionPlan|secret|private/);
    // survives a round trip through storage
    expect(readSharePayload(JSON.parse(JSON.stringify(p)))?.full?.risks).toHaveLength(8);
  });
  it("reads links made before the full report existed", () => {
    const old = { idea: "i", score: 40, risk: "High", summary: "s", risks: [], survive: [], pivot: null, signals: [], sharedAt: "2026-10-01T00:00:00Z" };
    expect(readSharePayload(old)?.full).toBeUndefined();
  });
  it("rejects malformed stored payloads", () => {
    expect(readSharePayload(null)).toBeNull();
    expect(readSharePayload({ idea: 1 })).toBeNull();
    expect(readSharePayload(buildSharePayload(result, "i"))?.idea).toBe("i");
  });
});
