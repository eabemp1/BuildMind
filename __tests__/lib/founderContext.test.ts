/**
 * __tests__/lib/founderContext.test.ts
 *
 * Unit tests for the pure functions in lib/founderContext.ts.
 * Network-dependent functions (fetchFounderContext, updateFounderContext,
 * recordOverride, recordCognitiveLoad, fetchMorningBriefing) are not
 * tested here — they require a live server. These tests cover every
 * pure exported function so any logic change surfaces immediately.
 */

import { describe, it, expect } from "vitest";
import {
  momentumOnTaskComplete,
  momentumOnReflect,
  momentumDecay,
  momentumOnOverride,
  isMomentumDecaying,
  momentumLabel,
} from "../../lib/founderContext";

// ── momentumOnTaskComplete ────────────────────────────────────────────────────

describe("momentumOnTaskComplete", () => {
  it("adds 6 for a normal task", () => {
    expect(momentumOnTaskComplete(50)).toBe(56);
  });

  it("adds 12 for a hard task", () => {
    expect(momentumOnTaskComplete(50, true)).toBe(62);
  });

  it("never exceeds 100 for a normal task", () => {
    expect(momentumOnTaskComplete(98)).toBe(100);
    expect(momentumOnTaskComplete(100)).toBe(100);
  });

  it("never exceeds 100 for a hard task", () => {
    expect(momentumOnTaskComplete(95, true)).toBe(100);
    expect(momentumOnTaskComplete(100, true)).toBe(100);
  });

  it("works from zero", () => {
    expect(momentumOnTaskComplete(0)).toBe(6);
    expect(momentumOnTaskComplete(0, true)).toBe(12);
  });

  it("isHardTask defaults to false", () => {
    expect(momentumOnTaskComplete(40)).toBe(momentumOnTaskComplete(40, false));
  });
});

// ── momentumOnReflect ─────────────────────────────────────────────────────────

describe("momentumOnReflect", () => {
  it("adds 3 for filing a reflection", () => {
    expect(momentumOnReflect(60)).toBe(63);
  });

  it("never exceeds 100", () => {
    expect(momentumOnReflect(99)).toBe(100);
    expect(momentumOnReflect(100)).toBe(100);
  });

  it("works from zero", () => {
    expect(momentumOnReflect(0)).toBe(3);
  });
});

// ── momentumDecay ─────────────────────────────────────────────────────────────

describe("momentumDecay", () => {
  it("decays by 2 per day inactive", () => {
    expect(momentumDecay(80, 1)).toBe(78);
    expect(momentumDecay(80, 3)).toBe(74);
  });

  it("caps total decay at 30 regardless of days inactive", () => {
    // 20 days * 2 = 40 decay, but capped at 30
    expect(momentumDecay(80, 20)).toBe(50);
    expect(momentumDecay(80, 50)).toBe(50);
  });

  it("floors at 20 regardless of decay", () => {
    expect(momentumDecay(25, 5)).toBe(20);
    expect(momentumDecay(20, 100)).toBe(20);
  });

  it("does not decay below 20 even from a low starting point", () => {
    expect(momentumDecay(21, 10)).toBe(20);
  });

  it("7-day break from 80 gives 66, not 0", () => {
    // The design intent: 7 days should take 80 → 66
    expect(momentumDecay(80, 7)).toBe(66);
  });

  it("1 day of inactivity produces gentle decay", () => {
    const after = momentumDecay(70, 1);
    expect(after).toBe(68);
    expect(after).toBeGreaterThan(60); // not punitive
  });
});

// ── momentumOnOverride ────────────────────────────────────────────────────────

describe("momentumOnOverride", () => {
  it("deducts 1 for overriding a task", () => {
    expect(momentumOnOverride(60)).toBe(59);
  });

  it("floors at 20", () => {
    expect(momentumOnOverride(20)).toBe(20);
    expect(momentumOnOverride(21)).toBe(20);
  });

  it("does not punish heavily — only -1", () => {
    const before = 55;
    const after = momentumOnOverride(before);
    expect(before - after).toBe(1);
  });
});

// ── isMomentumDecaying ────────────────────────────────────────────────────────

describe("isMomentumDecaying", () => {
  it("returns true when drop is >= 5", () => {
    expect(isMomentumDecaying(75, 80)).toBe(true);
    expect(isMomentumDecaying(70, 80)).toBe(true);
  });

  it("returns false when drop is < 5", () => {
    expect(isMomentumDecaying(77, 80)).toBe(false);
    expect(isMomentumDecaying(80, 80)).toBe(false);
  });

  it("returns false when score has increased", () => {
    expect(isMomentumDecaying(85, 80)).toBe(false);
  });

  it("boundary: exactly 5 points drop triggers warning", () => {
    expect(isMomentumDecaying(75, 80)).toBe(true);
  });

  it("boundary: 4 points drop does not trigger warning", () => {
    expect(isMomentumDecaying(76, 80)).toBe(false);
  });
});

// ── momentumLabel ─────────────────────────────────────────────────────────────

describe("momentumLabel", () => {
  it("returns Unstoppable at 80+", () => {
    expect(momentumLabel(80).label).toBe("Unstoppable");
    expect(momentumLabel(100).label).toBe("Unstoppable");
  });

  it("returns Building momentum at 65–79", () => {
    expect(momentumLabel(65).label).toBe("Building momentum");
    expect(momentumLabel(79).label).toBe("Building momentum");
  });

  it("returns Steady at 50–64", () => {
    expect(momentumLabel(50).label).toBe("Steady");
    expect(momentumLabel(64).label).toBe("Steady");
  });

  it("returns Slowing down at 35–49", () => {
    expect(momentumLabel(35).label).toBe("Slowing down");
    expect(momentumLabel(49).label).toBe("Slowing down");
  });

  it("returns Needs a win at < 35", () => {
    expect(momentumLabel(34).label).toBe("Needs a win");
    expect(momentumLabel(0).label).toBe("Needs a win");
    expect(momentumLabel(20).label).toBe("Needs a win");
  });

  it("returns a color and emoji for every tier", () => {
    [0, 35, 50, 65, 80].forEach(score => {
      const result = momentumLabel(score);
      expect(result.color).toBeTruthy();
      expect(result.emoji).toBeTruthy();
    });
  });

  it("is deterministic — same score same result", () => {
    expect(momentumLabel(72)).toEqual(momentumLabel(72));
  });

  it("covers all 5 tiers without throwing", () => {
    expect(() => {
      [10, 34, 35, 49, 50, 64, 65, 79, 80, 100].forEach(momentumLabel);
    }).not.toThrow();
  });
});

// ── Score invariants (cross-function) ─────────────────────────────────────────

describe("momentum score invariants", () => {
  it("completing a task always beats decaying for 1 day", () => {
    const start = 60;
    expect(momentumOnTaskComplete(start)).toBeGreaterThan(momentumDecay(start, 1));
  });

  it("hard task gain always > soft task gain", () => {
    const start = 50;
    expect(momentumOnTaskComplete(start, true)).toBeGreaterThan(momentumOnTaskComplete(start, false));
  });

  it("score never goes above 100 no matter how many tasks completed", () => {
    let score = 90;
    for (let i = 0; i < 10; i++) score = momentumOnTaskComplete(score, true);
    expect(score).toBe(100);
  });

  it("score never goes below 20 no matter how much decay", () => {
    let score = 20;
    for (let i = 0; i < 20; i++) score = momentumDecay(score, 5);
    expect(score).toBe(20);
  });

  it("override + reflection nets +2 (reflection outweighs override)", () => {
    const start = 60;
    const afterOverride = momentumOnOverride(start);  // 59
    const afterReflect  = momentumOnReflect(afterOverride); // 62
    expect(afterReflect).toBeGreaterThan(start);
  });
});
