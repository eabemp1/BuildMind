import { describe, it, expect } from "vitest";
import { PREP_KINDS } from "@/lib/prep/kinds";
import { capabilityFor, capabilityLine, capabilityBlock } from "@/lib/capability";

describe("capability", () => {
  it("covers every prep kind with all three parts", () => {
    for (const k of PREP_KINDS) {
      const c = capabilityFor(k);
      expect(c.prepares.length, k).toBeGreaterThan(5);
      expect(c.you.length, k).toBeGreaterThan(3);
      expect(c.result.length, k).toBeGreaterThan(5);
    }
  });
  it("counts only what BuildMind can really measure", () => {
    expect(capabilityFor("landing").level).toBe("counted");
    expect(capabilityFor("video_script").level).toBe("recorded");
    expect(capabilityLine("outreach")).toMatch(/follow-up reminder in 3 days/);
  });
  it("tells the planner what the app cannot do", () => {
    expect(capabilityBlock()).toMatch(/CANNOT/);
    expect(capabilityBlock()).toMatch(/ONE result/);
  });
});
