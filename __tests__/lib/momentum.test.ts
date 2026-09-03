/**
 * __tests__/lib/momentum.test.ts
 *
 * Unit tests for lib/momentum.ts — pure functions, no mocks needed.
 *
 * FIX (audit finding): every numeric expectation in this file previously
 * tested the pre-redesign linear-accumulator formula (+6/+12 per task flat,
 * -2/day flat decay, capped at 30 total, "7-day break lands at 66"). That
 * formula was replaced by the bounded EMA in lib/momentum.ts on June 30
 * 2026 (see that file's "v2 REDESIGN" comment) specifically because the
 * linear model let active founders permanently peg at 100. Nobody updated
 * these tests when the formula changed, so this file had been failing
 * (12 of 23 tests) since the redesign shipped — silently, since nothing in
 * the repo's CI gates on it. Values below are computed directly from the
 * current applyMomentumEMA() implementation (EMA_ALPHA = 0.25, floor 20,
 * ceiling 100), not guessed or reverse-engineered from desired behavior.
 */

import { describe, it, expect } from "vitest";
import {
  momentumOnTaskComplete,
  momentumOnReflect,
  momentumDecay,
  momentumOnOverride,
  isMomentumDecaying,
  momentumLabel,
  computeMomentumTrend,
  projectMomentum,
} from "@/lib/momentum";

describe("momentumOnTaskComplete", () => {
  it("pulls toward the daily signal (70) for a normal task", () => {
    expect(momentumOnTaskComplete(50)).toBe(55);
  });
  it("pulls toward a higher signal (85) for a hard task", () => {
    expect(momentumOnTaskComplete(50, true)).toBe(59);
  });
  it("reverts toward the signal rather than staying pinned near 100", () => {
    // EMA mean-reverts: a founder already at 98 who completes one more
    // *normal* task (signal 70) moves DOWN toward 70, not up toward 100.
    // This is the exact behavior the redesign intentionally introduced.
    expect(momentumOnTaskComplete(98)).toBe(91);
    expect(momentumOnTaskComplete(100)).toBe(93);
  });
  it("a hard task pulls toward 85, still below 100 from the ceiling", () => {
    expect(momentumOnTaskComplete(95, true)).toBe(93);
    expect(momentumOnTaskComplete(100, true)).toBe(96);
  });
  it("never drops below the 20 floor even from zero", () => {
    expect(momentumOnTaskComplete(0)).toBe(20);
    expect(momentumOnTaskComplete(0, true)).toBe(21);
  });
  it("isHardTask defaults to false", () => {
    expect(momentumOnTaskComplete(40)).toBe(momentumOnTaskComplete(40, false));
  });
});

describe("momentumOnReflect", () => {
  it("pulls toward the reflection signal (35)", () => {
    expect(momentumOnReflect(60)).toBe(54);
  });
  it("reverts toward 35 from a high starting point rather than capping at 100", () => {
    expect(momentumOnReflect(99)).toBe(83);
    expect(momentumOnReflect(100)).toBe(84);
  });
  it("never drops below the 20 floor even from zero", () => {
    expect(momentumOnReflect(0)).toBe(20);
  });
});

describe("momentumDecay", () => {
  it("is front-loaded, not a flat 2-per-day rate", () => {
    // EMA decay is proportional to distance from 0, so it's steepest on
    // day 1 and flattens out — not a constant per-day subtraction.
    expect(momentumDecay(80, 1)).toBe(60);
    expect(momentumDecay(80, 3)).toBe(34);
  });
  it("reaches the 20 floor well before 20 inactive days, not a 30-point cap", () => {
    expect(momentumDecay(80, 20)).toBe(20);
    expect(momentumDecay(80, 100)).toBe(20);
  });
  it("floors at 20", () => {
    expect(momentumDecay(25, 3)).toBe(20);
    expect(momentumDecay(20, 5)).toBe(20);
  });
  it("a 7-day break from 80 reaches the floor, not a gentle 66", () => {
    // NOTE: the product docs (buildmind-evidence-driven-product-findings.md)
    // describe "seven inactive days take 80 to 66" as the intended design.
    // That describes the superseded linear formula, not what
    // applyMomentumEMA() actually computes. This is a product decision to
    // revisit (soften the EMA decay curve, or accept the faster floor), not
    // a bug this test file should paper over by asserting the old number.
    expect(momentumDecay(80, 7)).toBe(20);
  });
});

describe("momentumOnOverride", () => {
  it("pulls toward the soft override signal (40)", () => {
    expect(momentumOnOverride(60)).toBe(55);
  });
  it("does not stay at the 20 floor — 40 pulls a low score up", () => {
    // Unlike task/reflect/decay, override's signal (40) sits above the
    // floor, so a founder at 20 moves UP to 25, not staying at 20.
    expect(momentumOnOverride(20)).toBe(25);
  });
  it("can raise a low score, since 40 is a soft/non-punitive signal", () => {
    // By design (see dailyActivitySignal in lib/momentum.ts), an override
    // is NOT punitive — it always pulls toward 40 regardless of current
    // score. A founder at 20 who overrides moves up to 25.
    expect(momentumOnOverride(20)).toBe(25);
  });
});

describe("isMomentumDecaying", () => {
  it("true when delta >= 5", () => {
    expect(isMomentumDecaying(60, 65)).toBe(true);
    expect(isMomentumDecaying(55, 65)).toBe(true);
  });
  it("false for small drops", () => {
    expect(isMomentumDecaying(62, 65)).toBe(false);
  });
  it("false when rising", () => {
    expect(isMomentumDecaying(70, 60)).toBe(false);
  });
});

describe("momentumLabel", () => {
  it("returns correct labels at thresholds", () => {
    expect(momentumLabel(80).label).toBe("Unstoppable");
    expect(momentumLabel(65).label).toBe("Building momentum");
    expect(momentumLabel(50).label).toBe("Steady");
    expect(momentumLabel(35).label).toBe("Slowing down");
    expect(momentumLabel(34).label).toBe("Needs a win");
    expect(momentumLabel(20).label).toBe("Needs a win");
  });
  it("returns a hex color and emoji for each tier", () => {
    [80, 65, 50, 35, 20].forEach((score) => {
      const { color, emoji } = momentumLabel(score);
      expect(color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(emoji.length).toBeGreaterThan(0);
    });
  });
});

describe("computeMomentumTrend", () => {
  it("rising when last > first by >= 5", () => {
    expect(computeMomentumTrend([50, 52, 55, 56, 58])).toBe("rising");
  });
  it("falling when last < first by >= 5", () => {
    expect(computeMomentumTrend([80, 78, 75, 74])).toBe("falling");
  });
  it("stable when delta < 5", () => {
    expect(computeMomentumTrend([60, 61, 60, 62])).toBe("stable");
  });
  it("stable with single data point", () => {
    expect(computeMomentumTrend([70])).toBe("stable");
  });
});

describe("projectMomentum", () => {
  it("projects inactivity via the same EMA decay as momentumDecay", () => {
    expect(projectMomentum(80, 3)).toBe(34);
  });
  it("never projects below 20", () => {
    expect(projectMomentum(25, 10)).toBe(20);
  });
});
