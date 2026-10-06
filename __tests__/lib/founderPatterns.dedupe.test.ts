import { describe, it, expect } from "vitest";
import { resolveStrengthsAndAvoidance } from "@/lib/founderPatterns";

describe("strength de-duplication", () => {
  it("drops a generic strength when a specific one covers the same work", () => {
    const r = resolveStrengthsAndAvoidance({
      strengths: ["content creation", "Social posts · LinkedIn", "Wireframes & prototypes · Figma"],
      avoidance: [], records: [],
    });
    expect(r.strengths).toContain("Social posts · LinkedIn");
    expect(r.strengths).not.toContain("content creation");
    expect(r.strengths).toContain("Wireframes & prototypes · Figma");
  });
});
