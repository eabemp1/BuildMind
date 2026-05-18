/**
 * __tests__/lib/momentum.test.ts
 *
 * Unit tests for lib/momentum.ts — pure functions, no mocks needed.
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
  it("adds 6 for normal tasks", () => {
    expect(momentumOnTaskComplete(50)).toBe(56);
  });
  it("adds 12 for hard tasks", () => {
    expect(momentumOnTaskComplete(50, true)).toBe(62);
  });
  it("caps at 100", () => {
    expect(momentumOnTaskComplete(98)).toBe(100);
    expect(momentumOnTaskComplete(95, true)).toBe(100);
  });
  it("works at minimum (20)", () => {
    expect(momentumOnTaskComplete(20)).toBe(26);
  });
});

describe("momentumOnReflect", () => {
  it("adds 3", () => {
    expect(momentumOnReflect(60)).toBe(63);
  });
  it("caps at 100", () => {
    expect(momentumOnReflect(99)).toBe(100);
  });
});

describe("momentumDecay", () => {
  it("decays 2 per inactive day", () => {
    expect(momentumDecay(80, 1)).toBe(78);
    expect(momentumDecay(80, 3)).toBe(74);
  });
  it("caps total decay at 30", () => {
    expect(momentumDecay(80, 20)).toBe(50); // 80 - 30 = 50
    expect(momentumDecay(80, 100)).toBe(50);
  });
  it("floors at 20", () => {
    expect(momentumDecay(25, 3)).toBe(20);
    expect(momentumDecay(20, 5)).toBe(20);
  });
  it("7-day break from 80 lands at 66, not 0", () => {
    expect(momentumDecay(80, 7)).toBe(66);
  });
});

describe("momentumOnOverride", () => {
  it("subtracts 1", () => {
    expect(momentumOnOverride(60)).toBe(59);
  });
  it("floors at 20", () => {
    expect(momentumOnOverride(20)).toBe(20);
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
  it("projects 3 days of inactivity from 80 → 74", () => {
    expect(projectMomentum(80, 3)).toBe(74);
  });
  it("never projects below 20", () => {
    expect(projectMomentum(25, 10)).toBe(20);
  });
});
