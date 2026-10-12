import { describe, it, expect } from "vitest";
import { buildFounderStyleProfile, buildFounderStylePromptBlock } from "@/lib/founderStyle";

describe("founderStyle", () => {
  it("reports no signal for a brand new founder and emits no prompt block", () => {
    const p = buildFounderStyleProfile({});
    expect(p.hasSignal).toBe(false);
    expect(buildFounderStylePromptBlock(p)).toBe("");
  });

  it("reads the archetype tag and labels the style", () => {
    const p = buildFounderStyleProfile({ memory: { personality_tags: ["archetype:validation-avoider"], avoidance_zones: ["customer calls"] } });
    expect(p.archetype).toBe("validation-avoider");
    expect(p.avoids).toEqual(["customer calls"]);
    const block = buildFounderStylePromptBlock(p);
    expect(block).toContain("customer calls");
    expect(block).toContain("PERSONALISATION RULES");
  });

  it("ignores unclassified or unknown archetype tags", () => {
    expect(buildFounderStyleProfile({ memory: { personality_tags: ["archetype:unclassified", "archetype:nope"] } }).archetype).toBeNull();
  });

  it("marks a long-inactive founder as stalled", () => {
    expect(buildFounderStyleProfile({ context: { days_inactive: 9, momentum_score: 60 } }).pace).toBe("stalled");
  });

  it("derives pace from task velocity and picks the strongest categories", () => {
    const p = buildFounderStyleProfile({ execution: { task_velocity_7d: 6, focus_distribution: [{ category: "build", count: 2 }, { category: "outreach", count: 9 }] } });
    expect(p.pace).toBe("fast");
    expect(p.strongCategories[0]).toBe("outreach");
  });
});
