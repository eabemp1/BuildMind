import { describe, it, expect } from "vitest";
import { recommendedFor } from "@/lib/work/recommend";
import { catalog } from "@/lib/work/registry";

describe("work recommendations", () => {
  it("every recommended id exists in the catalogue, for every stage", () => {
    const ids = new Set(catalog().map((e) => e.id));
    for (const stage of ["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue", "", "nonsense"]) {
      const r = recommendedFor(stage);
      expect(r.length).toBeGreaterThan(0);
      expect(r.length).toBeLessThanOrEqual(3);
      for (const x of r) expect(ids.has(x.id)).toBe(true);
    }
  });
  it("validation stage starts with the interview kit", () => {
    expect(recommendedFor("Validation")[0].id).toBe("existing:validation_kit");
  });
  it("skips jobs already made", () => {
    expect(recommendedFor("Validation", ["validation_kit"]).map((r) => r.id)).not.toContain("existing:validation_kit");
  });
});
