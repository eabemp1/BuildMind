/**
 * __tests__/lib/journeyGamification.test.ts
 *
 * Tests for lib/journeyGamification.ts — pure XP/level arithmetic, no I/O.
 *
 * Covers:
 *   - xpForEvent: every event type maps to the documented value
 *   - levelForXp: boundary conditions at every level threshold, negative/
 *     fractional input handling, max-level clamping
 */

import { describe, it, expect } from "vitest";
import { xpForEvent, levelForXp, computeStreak, JOURNEY_LEVELS, JOURNEY_XP_VALUES, JOURNEY_ACHIEVEMENTS } from "../../lib/journeyGamification";

// ── xpForEvent ────────────────────────────────────────────────────────────────

describe("xpForEvent", () => {
  it("returns the documented XP value for every event type", () => {
    expect(xpForEvent("lesson_completed")).toBe(10);
    expect(xpForEvent("exercise_completed")).toBe(15);
    expect(xpForEvent("quiz_passed")).toBe(25);
    expect(xpForEvent("milestone_completed")).toBe(50);
    expect(xpForEvent("project_submitted")).toBe(100);
    expect(xpForEvent("project_passed")).toBe(150);
    expect(xpForEvent("revision_completed")).toBe(75);
    expect(xpForEvent("mentor_challenge")).toBe(100);
    expect(xpForEvent("capstone_milestone")).toBe(250);
  });

  it("JOURNEY_XP_VALUES has no zero or negative values", () => {
    for (const value of Object.values(JOURNEY_XP_VALUES)) {
      expect(value).toBeGreaterThan(0);
    }
  });
});

// ── JOURNEY_LEVELS integrity ────────────────────────────────────────────────

describe("JOURNEY_LEVELS integrity", () => {
  it("has exactly 10 levels", () => {
    expect(JOURNEY_LEVELS).toHaveLength(10);
  });

  it("is ordered ascending by both level number and minXp", () => {
    for (let i = 1; i < JOURNEY_LEVELS.length; i++) {
      expect(JOURNEY_LEVELS[i].level).toBe(JOURNEY_LEVELS[i - 1].level + 1);
      expect(JOURNEY_LEVELS[i].minXp).toBeGreaterThan(JOURNEY_LEVELS[i - 1].minXp);
    }
  });

  it("level 1 starts at 0 XP", () => {
    expect(JOURNEY_LEVELS[0].minXp).toBe(0);
  });
});

// ── levelForXp — boundaries ─────────────────────────────────────────────────

describe("levelForXp — level boundaries", () => {
  it("returns level 1 at exactly 0 XP", () => {
    const result = levelForXp(0);
    expect(result.level).toBe(1);
    expect(result.levelName).toBe("Python Explorer");
    expect(result.xpIntoLevel).toBe(0);
  });

  it("returns level 1 for any XP just below the level-2 threshold", () => {
    const result = levelForXp(249);
    expect(result.level).toBe(1);
  });

  it("crosses into level 2 at exactly the threshold", () => {
    const result = levelForXp(250);
    expect(result.level).toBe(2);
    expect(result.levelName).toBe("Code Apprentice");
    expect(result.xpIntoLevel).toBe(0);
  });

  it("computes xpIntoLevel and xpToNextLevel correctly mid-level", () => {
    // Level 2 starts at 250, level 3 at 600.
    const result = levelForXp(400);
    expect(result.level).toBe(2);
    expect(result.xpIntoLevel).toBe(150);
    expect(result.xpToNextLevel).toBe(200);
  });

  it("reaches every level threshold exactly, one at a time", () => {
    for (const lvl of JOURNEY_LEVELS) {
      const result = levelForXp(lvl.minXp);
      expect(result.level).toBe(lvl.level);
      expect(result.levelName).toBe(lvl.name);
    }
  });

  it("clamps at the max level and reports xpToNextLevel: null", () => {
    const result = levelForXp(999_999);
    expect(result.level).toBe(10);
    expect(result.levelName).toBe("Software Engineer");
    expect(result.isMaxLevel).toBe(true);
    expect(result.xpToNextLevel).toBeNull();
  });

  it("is not max level for anything below the level-10 threshold", () => {
    const level10 = JOURNEY_LEVELS[JOURNEY_LEVELS.length - 1];
    const result = levelForXp(level10.minXp - 1);
    expect(result.isMaxLevel).toBe(false);
    expect(result.xpToNextLevel).toBe(1);
  });
});

// ── levelForXp — malformed input ────────────────────────────────────────────

describe("levelForXp — defensive handling of bad input", () => {
  it("treats negative XP as 0 rather than throwing or going negative", () => {
    const result = levelForXp(-500);
    expect(result.level).toBe(1);
    expect(result.totalXp).toBe(0);
  });

  it("floors fractional XP", () => {
    const result = levelForXp(249.9);
    expect(result.totalXp).toBe(249);
    expect(result.level).toBe(1);
  });
});

// ── computeStreak ────────────────────────────────────────────────────────────

describe("computeStreak", () => {
  const TODAY = new Date("2026-08-09T12:00:00Z"); // a Sunday, matches "today" in this conversation

  it("returns zero/zero for no activity", () => {
    expect(computeStreak([], TODAY)).toEqual({ currentStreak: 0, longestStreak: 0 });
  });

  it("counts a single day of activity today as a streak of 1", () => {
    const result = computeStreak(["2026-08-09T08:00:00Z"], TODAY);
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(1);
  });

  it("does not zero the current streak if the most recent activity was yesterday", () => {
    const result = computeStreak(["2026-08-08T08:00:00Z"], TODAY);
    expect(result.currentStreak).toBe(1);
  });

  it("zeros the current streak if the most recent activity was 2+ days ago", () => {
    const result = computeStreak(["2026-08-06T08:00:00Z"], TODAY);
    expect(result.currentStreak).toBe(0);
  });

  it("counts multiple timestamps on the same day as one day of activity", () => {
    const result = computeStreak(
      ["2026-08-09T08:00:00Z", "2026-08-09T14:00:00Z", "2026-08-09T20:00:00Z"],
      TODAY,
    );
    expect(result.currentStreak).toBe(1);
  });

  it("counts a run of consecutive days correctly", () => {
    const result = computeStreak(
      ["2026-08-05T08:00:00Z", "2026-08-06T08:00:00Z", "2026-08-07T08:00:00Z", "2026-08-08T08:00:00Z", "2026-08-09T08:00:00Z"],
      TODAY,
    );
    expect(result.currentStreak).toBe(5);
    expect(result.longestStreak).toBe(5);
  });

  it("breaks the current streak on a gap, but preserves longestStreak from an earlier run", () => {
    const result = computeStreak(
      [
        // A 4-day run two weeks ago (the longest run)
        "2026-07-20T08:00:00Z",
        "2026-07-21T08:00:00Z",
        "2026-07-22T08:00:00Z",
        "2026-07-23T08:00:00Z",
        // Then a gap, then activity today only
        "2026-08-09T08:00:00Z",
      ],
      TODAY,
    );
    expect(result.currentStreak).toBe(1);
    expect(result.longestStreak).toBe(4);
  });

  it("current streak can itself be the longest streak", () => {
    const result = computeStreak(
      ["2026-08-07T08:00:00Z", "2026-08-08T08:00:00Z", "2026-08-09T08:00:00Z"],
      TODAY,
    );
    expect(result.currentStreak).toBe(3);
    expect(result.longestStreak).toBe(3);
  });

  it("ignores malformed timestamp strings rather than throwing", () => {
    const result = computeStreak(["not-a-date", "2026-08-09T08:00:00Z", ""], TODAY);
    expect(result.currentStreak).toBe(1);
  });
});

// ── JOURNEY_ACHIEVEMENTS ─────────────────────────────────────────────────────

describe("JOURNEY_ACHIEVEMENTS", () => {
  it("has unique ids", () => {
    const ids = JOURNEY_ACHIEVEMENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every achievement has a non-empty name and description", () => {
    for (const a of JOURNEY_ACHIEVEMENTS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.description.length).toBeGreaterThan(0);
    }
  });

  function baseStats(overrides: Partial<import("../../lib/journeyGamification").JourneyAchievementStats> = {}) {
    return {
      projectsPassed: 0,
      modulesPassed: [] as number[],
      currentStreak: 0,
      longestStreak: 0,
      hasComeback: false,
      ...overrides,
    };
  }

  it("first_build unlocks at 1 project passed, not 0", () => {
    const first_build = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "first_build")!;
    expect(first_build.condition(baseStats({ projectsPassed: 0 }))).toBe(false);
    expect(first_build.condition(baseStats({ projectsPassed: 1 }))).toBe(true);
  });

  it("five_projects requires exactly 5, not 4", () => {
    const five = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "five_projects")!;
    expect(five.condition(baseStats({ projectsPassed: 4 }))).toBe(false);
    expect(five.condition(baseStats({ projectsPassed: 5 }))).toBe(true);
  });

  it("capstone requires module 16 specifically, not just 16 projects passed", () => {
    const capstone = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "capstone")!;
    expect(capstone.condition(baseStats({ projectsPassed: 15, modulesPassed: Array.from({ length: 15 }, (_, i) => i + 1) }))).toBe(false);
    expect(capstone.condition(baseStats({ modulesPassed: [16] }))).toBe(true);
  });

  it("comeback requires the hasComeback flag, not just a streak or passed project", () => {
    const comeback = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "comeback")!;
    expect(comeback.condition(baseStats({ projectsPassed: 10, currentStreak: 30 }))).toBe(false);
    expect(comeback.condition(baseStats({ hasComeback: true }))).toBe(true);
  });

  it("two_week_streak checks longestStreak, so it stays unlocked even after the streak later breaks", () => {
    const twoWeek = JOURNEY_ACHIEVEMENTS.find((a) => a.id === "two_week_streak")!;
    expect(twoWeek.condition(baseStats({ currentStreak: 0, longestStreak: 14 }))).toBe(true);
    expect(twoWeek.condition(baseStats({ currentStreak: 14, longestStreak: 13 }))).toBe(false);
  });
});
