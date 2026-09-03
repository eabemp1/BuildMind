/**
 * __tests__/lib/founderContext.test.ts
 *
 * Unit tests for the pure functions in lib/founderContext.ts.
 * Network-dependent functions (fetchFounderContext, updateFounderContext,
 * recordOverride, recordCognitiveLoad, fetchMorningBriefing) are not
 * tested here — they require a live server. These tests cover every
 * pure exported function so any logic change surfaces immediately.
 *
 * FIX (audit finding): the momentum-related expectations below tested the
 * pre-redesign linear formula, same issue as __tests__/lib/momentum.test.ts
 * (which this file duplicates via the founderContext.ts barrel re-export —
 * see that file for the full explanation). Values corrected to match the
 * current EMA implementation in lib/momentum.ts.
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
  it("pulls toward the daily signal (70) for a normal task", () => {
    expect(momentumOnTaskComplete(50)).toBe(55);
  });

  it("pulls toward a higher signal (85) for a hard task", () => {
    expect(momentumOnTaskComplete(50, true)).toBe(59);
  });

  it("reverts toward the signal instead of staying pinned at 100", () => {
    expect(momentumOnTaskComplete(98)).toBe(91);
    expect(momentumOnTaskComplete(100)).toBe(93);
  });

  it("a hard task still reverts below 100 from the ceiling", () => {
    expect(momentumOnTaskComplete(95, true)).toBe(93);
    expect(momentumOnTaskComplete(100, true)).toBe(96);
  });

  it("floors at 20 from zero rather than adding a flat amount", () => {
    expect(momentumOnTaskComplete(0)).toBe(20);
    expect(momentumOnTaskComplete(0, true)).toBe(21);
  });

  it("isHardTask defaults to false", () => {
    expect(momentumOnTaskComplete(40)).toBe(momentumOnTaskComplete(40, false));
  });
});

// ── momentumOnReflect ─────────────────────────────────────────────────────────

describe("momentumOnReflect", () => {
  it("pulls toward the reflection signal (35)", () => {
    expect(momentumOnReflect(60)).toBe(54);
  });

  it("reverts toward 35 instead of staying pinned at 100", () => {
    expect(momentumOnReflect(99)).toBe(83);
    expect(momentumOnReflect(100)).toBe(84);
  });

  it("floors at 20 from zero", () => {
    expect(momentumOnReflect(0)).toBe(20);
  });
});

// ── momentumDecay ─────────────────────────────────────────────────────────────

describe("momentumDecay", () => {
  it("is front-loaded, not a flat 2-per-day rate", () => {
    expect(momentumDecay(80, 1)).toBe(60);
    expect(momentumDecay(80, 3)).toBe(34);
  });

  it("reaches the 20 floor well before 20 inactive days, not a 30-point cap", () => {
    expect(momentumDecay(80, 20)).toBe(20);
    expect(momentumDecay(80, 50)).toBe(20);
  });

  it("floors at 20 regardless of decay", () => {
    expect(momentumDecay(25, 5)).toBe(20);
    expect(momentumDecay(20, 100)).toBe(20);
  });

  it("does not decay below 20 even from a low starting point", () => {
    expect(momentumDecay(21, 10)).toBe(20);
  });

  it("a 7-day break from 80 reaches the floor, not a gentle 66", () => {
    // See __tests__/lib/momentum.test.ts for why: the "66" figure describes
    // the superseded linear formula, not the current EMA implementation.
    expect(momentumDecay(80, 7)).toBe(20);
  });

  it("1 day of inactivity is the steepest single-day drop, not the gentlest", () => {
    // EMA decay is front-loaded — day 1 pulls hardest toward 0, then each
    // subsequent day's marginal drop shrinks. This is the opposite of
    // "gentle decay on day one."
    const after = momentumDecay(70, 1);
    expect(after).toBe(53);
  });
});

// ── momentumOnOverride ────────────────────────────────────────────────────────

describe("momentumOnOverride", () => {
  it("pulls toward the soft override signal (40), not a flat -1", () => {
    expect(momentumOnOverride(60)).toBe(55);
  });

  it("does not stay at the 20 floor — 40 pulls a low score up", () => {
    expect(momentumOnOverride(20)).toBe(25);
  });

  it("is non-punitive: it can raise a score below 40, not just lower one above it", () => {
    // dailyActivitySignal() always returns 40 for an override regardless of
    // current score — a founder below 40 moves UP toward it.
    expect(momentumOnOverride(21)).toBeGreaterThan(21);
    expect(momentumOnOverride(60)).toBeLessThan(60);
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

  it("repeated hard-task completion converges near the hard-task signal (85), not 100", () => {
    // Under EMA, repeated identical signals converge toward that signal,
    // not toward the ceiling — the whole point of the redesign was to stop
    // scores from permanently pegging at 100.
    let score = 90;
    for (let i = 0; i < 10; i++) score = momentumOnTaskComplete(score, true);
    expect(score).toBeLessThan(90);
    expect(score).toBeGreaterThanOrEqual(85);
  });

  it("score never goes below 20 no matter how much decay", () => {
    let score = 20;
    for (let i = 0; i < 20; i++) score = momentumDecay(score, 5);
    expect(score).toBe(20);
  });

  it("reflecting always beats staying silent, even after an override", () => {
    // The old "-1 then +3 nets +2" relationship was specific to the linear
    // formula and no longer holds under EMA (an override-then-reflect from
    // 60 now lands at 50, below the start — both pulls are toward values
    // under 60). What does still hold, and is the actually meaningful
    // invariant: filing a reflection after an override is always better
    // than letting that day decay with no engagement at all.
    const start = 60;
    const afterOverride = momentumOnOverride(start);
    const afterReflect  = momentumOnReflect(afterOverride);
    const afterOverrideThenDecay = momentumDecay(afterOverride, 1);
    expect(afterReflect).toBeGreaterThan(afterOverrideThenDecay);
  });
});
