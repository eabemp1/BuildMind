import { describe, it, expect } from "vitest";
import { featureLimit, limitMessage } from "@/lib/featureLimits";
describe("feature limits", () => {
  it("free gets none, trial less than builder", () => {
    expect(featureLimit("agents", "free")).toBe(0);
    expect(featureLimit("agents", "trial")).toBeLessThan(featureLimit("agents", "builder"));
    expect(featureLimit("radar", "builder")).toBe(4);
  });
  it("message is plain and names the reset", () => {
    expect(limitMessage("agents", 25)).toContain("25 agent runs");
    expect(limitMessage("radar", 4)).toContain("midnight UTC");
  });
});
