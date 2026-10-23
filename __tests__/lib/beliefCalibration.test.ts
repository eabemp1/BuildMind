import { describe, expect, it } from "vitest";
import { calibrateBelief, findPatternStat, wilsonLowerBound } from "../../lib/beliefCalibration";

describe("wilsonLowerBound", () => {
  it("is 0 with no observations", () => expect(wilsonLowerBound(0, 0)).toBe(0));
  it("grows with sample size at a perfect rate", () => {
    const a = wilsonLowerBound(3, 3), b = wilsonLowerBound(10, 10), c = wilsonLowerBound(30, 30);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(a).toBeGreaterThan(0.55);
    expect(a).toBeLessThan(0.75);
    expect(c).toBeGreaterThan(0.9);
  });
  it("is below the observed rate and within 0..1", () => {
    for (const [k, n] of [[0, 5], [2, 5], [5, 5], [7, 20], [1, 1]] as const) {
      const v = wilsonLowerBound(k, n);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(k / n + 1e-9);
    }
  });
  it("clamps nonsense inputs", () => {
    expect(wilsonLowerBound(-4, 5)).toBeCloseTo(0, 6);
    expect(wilsonLowerBound(99, 5)).toBe(wilsonLowerBound(5, 5));
  });
});

describe("calibrateBelief", () => {
  it("3 of 3 completed is far below a 95% profile ceiling and flagged early", () => {
    const c = calibrateBelief({ kind: "strength", ceiling: 0.95, stat: { label: "Usability sessions", completed: 3, total: 3 } });
    expect(c.confidence).toBeLessThan(0.75);
    expect(c.observations).toBe(3);
    expect(c.early).toBe(true);
    expect(c.basis).toBe("3 of 3 related tasks completed");
  });
  it("more evidence earns more confidence, never above the ceiling", () => {
    const small = calibrateBelief({ kind: "strength", ceiling: 0.95, stat: { label: "x", completed: 4, total: 4 } });
    const big = calibrateBelief({ kind: "strength", ceiling: 0.95, stat: { label: "x", completed: 25, total: 25 } });
    expect(big.confidence).toBeGreaterThan(small.confidence);
    expect(big.early).toBe(false);
    const capped = calibrateBelief({ kind: "strength", ceiling: 0.6, stat: { label: "x", completed: 25, total: 25 } });
    expect(capped.confidence).toBe(0.6);
  });
  it("avoidance uses the not-finished share", () => {
    const c = calibrateBelief({ kind: "avoidance", ceiling: 0.9, stat: { label: "outreach", completed: 1, total: 8 } });
    expect(c.basis).toBe("7 of 8 related tasks not finished");
    expect(c.confidence).toBeGreaterThan(0.5);
  });
  it("a mostly-completed area is a weak avoidance", () => {
    const c = calibrateBelief({ kind: "avoidance", ceiling: 0.9, stat: { label: "x", completed: 9, total: 10 } });
    expect(c.confidence).toBeLessThan(0.2);
  });
  it("no per-area count is capped and says so", () => {
    const c = calibrateBelief({ kind: "strength", ceiling: 0.95, stat: null });
    expect(c.confidence).toBeLessThanOrEqual(0.55);
    expect(c.observations).toBeNull();
    expect(c.early).toBe(true);
    expect(c.basis).toMatch(/no count/);
  });
  it("singular wording for one task", () => {
    expect(calibrateBelief({ kind: "strength", ceiling: 1, stat: { label: "x", completed: 1, total: 1 } }).basis).toBe("1 of 1 related task completed");
  });
  it("operating windows stay at 50% and early", () => {
    const c = calibrateBelief({ kind: "window", ceiling: 0.95 });
    expect(c.confidence).toBe(0.5);
    expect(c.early).toBe(true);
  });
});

describe("findPatternStat", () => {
  const stats = [{ label: "Usability sessions", completed: 3, total: 3 }, { label: "outreach", completed: 1, total: 8 }];
  it("matches exact, case-insensitive", () => expect(findPatternStat("usability sessions", stats)?.total).toBe(3));
  it("matches by containment", () => expect(findPatternStat("Direct outreach", stats)?.total).toBe(8));
  it("returns null for empty or unrelated", () => {
    expect(findPatternStat("pricing", stats)).toBeNull();
    expect(findPatternStat("x", [])).toBeNull();
    expect(findPatternStat("", stats)).toBeNull();
  });
});

import { beliefSubject, checkCorrection } from "@/lib/beliefCalibration";

describe("beliefSubject", () => {
  it("strips the belief sentence frame", () => {
    expect(beliefSubject("You tend to avoid cold outreach.")).toBe("cold outreach");
    expect(beliefSubject("You tend to be strong at Usability sessions.")).toBe("Usability sessions");
  });
});

describe("checkCorrection", () => {
  const at = { completed: 1, total: 5 };
  it("says too early with under 3 new tasks", () => {
    expect(checkCorrection("avoidance", at, { completed: 2, total: 7 })?.verdict).toBe("too_early");
    expect(checkCorrection("avoidance", at, { completed: 1, total: 5 })?.line).toContain("No related tasks");
  });
  it("avoidance corrected and work finished: holding", () => {
    const r = checkCorrection("avoidance", at, { completed: 5, total: 9 });
    expect(r?.verdict).toBe("holding");
    expect(r?.line).toContain("4 of 4");
  });
  it("avoidance corrected but still skipped: not holding", () => {
    expect(checkCorrection("avoidance", at, { completed: 1, total: 9 })?.verdict).toBe("not_holding");
  });
  it("strength corrected: finishing it supports the original belief", () => {
    expect(checkCorrection("strength", at, { completed: 6, total: 9 })?.verdict).toBe("not_holding");
    expect(checkCorrection("strength", at, { completed: 1, total: 9 })?.verdict).toBe("holding");
  });
  it("mixed in the middle", () => {
    expect(checkCorrection("avoidance", { completed: 0, total: 0 }, { completed: 2, total: 4 })?.verdict).toBe("mixed");
  });
  it("null for windows or missing snapshots", () => {
    expect(checkCorrection("window", at, at)).toBeNull();
    expect(checkCorrection("avoidance", null, at)).toBeNull();
  });
  it("never goes negative", () => {
    expect(checkCorrection("avoidance", { completed: 9, total: 9 }, { completed: 2, total: 3 })?.since_total).toBe(0);
  });
});
