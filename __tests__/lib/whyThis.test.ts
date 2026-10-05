import { describe, it, expect } from "vitest";
import { buildWhyThis } from "@/lib/whyThis";

describe("buildWhyThis", () => {
  it("says so when there is no data", () => {
    const m = buildWhyThis({});
    expect(m.confidence.level).toBe("unknown");
    expect(m.reasons[0]).toMatch(/stage/);
    expect(m.usedReflection).toBeNull();
    expect(m.fallbackNote).toBeNull();
  });
  it("reports low confidence honestly", () => {
    const m = buildWhyThis({ isLowConfidence: true, intelligence: { decision: { top_candidate: { scores: { total: 50, confidence: 25 } } } } });
    expect(m.confidence.level).toBe("low");
  });
  it("lists signals, evidence and alternatives", () => {
    const m = buildWhyThis({
      intelligence: {
        top_signals: [{ title: "Outreach gap", summary: "No conversations logged", confidence: 80, evidence: [{ source: "tasks", detail: "0 interviews in 14 days" }] }],
        decision: { top_candidate: { expected_evidence: "3 replies", scores: { total: 80, confidence: 82 } }, alternatives: [{ action: "Polish landing page", why_it_beats_alternatives: "Lower evidence value" }] },
      },
    });
    expect(m.confidence.level).toBe("high");
    expect(m.signals[0].detail).toContain("0 interviews");
    expect(m.alternatives).toHaveLength(1);
    expect(m.reasons.join(" ")).toContain("3 replies");
  });
  it("explains fallback tasks", () => {
    expect(buildWhyThis({ reflexion: { wasHardFallback: true } }).fallbackNote).toMatch(/quality check/);
    expect(buildWhyThis({ isAI: false }).fallbackNote).toMatch(/built-in/);
  });
  it("reports reflection use", () => {
    expect(buildWhyThis({ reflexion: { lastReflectionUsed: true } }).usedReflection).toBe(true);
    expect(buildWhyThis({ reflexion: { lastReflectionUsed: false } }).usedReflection).toBe(false);
  });
});
