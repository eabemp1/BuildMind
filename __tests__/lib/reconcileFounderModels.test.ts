import { describe, it, expect } from "vitest";
import { reconcileFounderModels, sameTopic } from "@/lib/reconcileFounderModels";

describe("reconcileFounderModels", () => {
  it("matches topics by shared word", () => {
    expect(sameTopic("customer discovery", "Customer outreach")).toBe(true);
    expect(sameTopic("shipping code", "pricing")).toBe(false);
  });
  it("flags avoid-vs-strength clashes", () => {
    const out = reconcileFounderModels({ strengths: ["customer discovery"], avoidancePatterns: [], behavioralAvoidance: ["customer outreach"] });
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("customer outreach");
  });
  it("flags archetype strength vs observed avoidance", () => {
    const out = reconcileFounderModels({ strengths: [], avoidancePatterns: ["pricing conversations"], behavioralAvoidance: [], behavioralStrength: "Strong pricing instincts" });
    expect(out).toHaveLength(1);
  });
  it("returns nothing when they agree", () => {
    expect(reconcileFounderModels({ strengths: ["building"], avoidancePatterns: ["outreach"], behavioralAvoidance: ["outreach"] })).toEqual([]);
  });
});
