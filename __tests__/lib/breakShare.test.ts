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
  it("rejects malformed stored payloads", () => {
    expect(readSharePayload(null)).toBeNull();
    expect(readSharePayload({ idea: 1 })).toBeNull();
    expect(readSharePayload(buildSharePayload(result, "i"))?.idea).toBe("i");
  });
});
