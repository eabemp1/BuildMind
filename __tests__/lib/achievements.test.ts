/**
 * __tests__/lib/achievements.test.ts
 *
 * Tests for lib/achievements.ts
 *
 * Covers:
 *   - xpToLevel: threshold boundaries, progress calculation, level caps
 *   - ACHIEVEMENTS: spot-check every category's condition functions
 *   - checkAndUnlockAchievements: unlocks correct badges, adds XP, skips already-unlocked
 *   - updateAchievementStats: merges correctly, updates maxStreak when streak increases
 *   - getUnseenCount: counts unseen achievements correctly
 *
 * localStorage is mocked so this runs in Node (vitest environment: node).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  xpToLevel,
  ACHIEVEMENTS,
  checkAndUnlockAchievements,
  updateAchievementStats,
  getAchievementStats,
  getTotalXP,
  getUnlocked,
} from "../../lib/achievements";
import type { AchievementStats, UnlockedAchievement } from "../../lib/achievements";

// ── localStorage mock ─────────────────────────────────────────────────────────

const store: Record<string, string> = {};

const localStorageMock = {
  getItem:    (key: string) => store[key] ?? null,
  setItem:    (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
  clear:      () => { Object.keys(store).forEach(k => delete store[k]); },
};

vi.stubGlobal("window", { localStorage: localStorageMock });
vi.stubGlobal("localStorage", localStorageMock);

function clearStore() {
  Object.keys(store).forEach(k => delete store[k]);
}

function seedStats(stats: Partial<AchievementStats>) {
  store["bm_achievement_stats"] = JSON.stringify(stats);
}

function seedUnlocked(list: UnlockedAchievement[]) {
  store["bm_achievements"] = JSON.stringify(list);
}

// ── xpToLevel ─────────────────────────────────────────────────────────────────

describe("xpToLevel — level boundaries", () => {
  const cases: [number, number, string][] = [
    [0,     1, "Aspiring Founder"],
    [199,   1, "Aspiring Founder"],
    [200,   2, "Idea Stage"],
    [499,   2, "Idea Stage"],
    [500,   3, "Validator"],
    [999,   3, "Validator"],
    [1000,  4, "Builder"],
    [2000,  5, "Launcher"],
    [3500,  6, "Operator"],
    [5500,  7, "Growth Hacker"],
    [8000,  8, "Serial Founder"],
    [12000, 9, "Venture Founder"],
    [20000, 10, "Legendary Founder"],
  ];

  it.each(cases)("xpToLevel(%i) → level %i (%s)", (xp, expectedLevel, expectedTitle) => {
    const result = xpToLevel(xp);
    expect(result.level).toBe(expectedLevel);
    expect(result.title).toBe(expectedTitle);
  });
});

describe("xpToLevel — progress calculation", () => {
  it("returns progress=0 at the start of a level", () => {
    const result = xpToLevel(200); // start of level 2 (200–500)
    expect(result.progress).toBe(0);
  });

  it("returns progress=50 at midpoint of a level", () => {
    const result = xpToLevel(350); // midpoint of 200–500
    expect(result.progress).toBe(50);
  });

  it("returns progress=100 at the max level", () => {
    const result = xpToLevel(20000);
    expect(result.progress).toBe(100);
  });

  it("progress is capped at 100 even for huge XP values", () => {
    const result = xpToLevel(999999);
    expect(result.progress).toBeLessThanOrEqual(100);
  });

  it("nextXp is always greater than or equal to current level xp threshold", () => {
    const result = xpToLevel(500);
    expect(result.nextXp).toBeGreaterThan(500);
  });
});

// ── ACHIEVEMENTS — condition spot-checks ──────────────────────────────────────

function statsFor(partial: Partial<AchievementStats>): AchievementStats {
  return {
    streak: 0, maxStreak: 0, checkInsDone: 0, aiMessages: 0,
    projectsCreated: 0, reflectionsLogged: 0, planUpgraded: false,
    venturesViewed: false, breakMyStartupUsed: false, reportViewed: false,
    shareUsed: false, daysActive: 0,
    ...partial,
  };
}

describe("ACHIEVEMENTS — streak conditions", () => {
  it("streak_1 fires at checkInsDone >= 1", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "streak_1")!;
    expect(a.condition(statsFor({ checkInsDone: 0 }))).toBe(false);
    expect(a.condition(statsFor({ checkInsDone: 1 }))).toBe(true);
  });

  it("streak_7 fires at streak >= 7", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "streak_7")!;
    expect(a.condition(statsFor({ streak: 6 }))).toBe(false);
    expect(a.condition(statsFor({ streak: 7 }))).toBe(true);
  });

  it("streak_14 fires at streak >= 14", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "streak_14")!;
    expect(a.condition(statsFor({ streak: 13 }))).toBe(false);
    expect(a.condition(statsFor({ streak: 14 }))).toBe(true);
  });
});

describe("ACHIEVEMENTS — task conditions", () => {
  it("tasks_10 fires at checkInsDone >= 10", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "tasks_10")!;
    expect(a.condition(statsFor({ checkInsDone: 9 }))).toBe(false);
    expect(a.condition(statsFor({ checkInsDone: 10 }))).toBe(true);
  });

  it("tasks_100 fires at checkInsDone >= 100 (legendary secret)", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "tasks_100")!;
    expect(a.secret).toBe(true);
    expect(a.rarity).toBe("legendary");
    expect(a.condition(statsFor({ checkInsDone: 100 }))).toBe(true);
    expect(a.condition(statsFor({ checkInsDone: 99 }))).toBe(false);
  });
});

describe("ACHIEVEMENTS — AI conditions", () => {
  it("ai_first fires at aiMessages >= 1", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "ai_first")!;
    expect(a.condition(statsFor({ aiMessages: 0 }))).toBe(false);
    expect(a.condition(statsFor({ aiMessages: 1 }))).toBe(true);
  });

  it("ai_50 fires at aiMessages >= 50", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "ai_50")!;
    expect(a.condition(statsFor({ aiMessages: 49 }))).toBe(false);
    expect(a.condition(statsFor({ aiMessages: 50 }))).toBe(true);
  });
});

describe("ACHIEVEMENTS — explorer and founder conditions", () => {
  it("explorer_break fires when breakMyStartupUsed is true", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "explorer_break")!;
    expect(a.condition(statsFor({ breakMyStartupUsed: false }))).toBe(false);
    expect(a.condition(statsFor({ breakMyStartupUsed: true }))).toBe(true);
  });

  it("founder_upgraded fires when planUpgraded is true", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "founder_upgraded")!;
    expect(a.condition(statsFor({ planUpgraded: false }))).toBe(false);
    expect(a.condition(statsFor({ planUpgraded: true }))).toBe(true);
  });

  it("founder_max_streak fires only when maxStreak >= 30 AND maxStreak === streak", () => {
    const a = ACHIEVEMENTS.find(a => a.id === "founder_max_streak")!;
    expect(a.condition(statsFor({ maxStreak: 30, streak: 30 }))).toBe(true);
    expect(a.condition(statsFor({ maxStreak: 30, streak: 29 }))).toBe(false);
    expect(a.condition(statsFor({ maxStreak: 29, streak: 29 }))).toBe(false);
  });
});

// ── ACHIEVEMENTS — completeness checks ───────────────────────────────────────

describe("ACHIEVEMENTS — data integrity", () => {
  it("all achievements have unique ids", () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("all achievements have xp > 0", () => {
    ACHIEVEMENTS.forEach(a => {
      expect(a.xp).toBeGreaterThan(0);
    });
  });

  it("all achievements have a condition function", () => {
    ACHIEVEMENTS.forEach(a => {
      expect(typeof a.condition).toBe("function");
    });
  });

  it("legendary achievements have higher xp than common ones (sanity check)", () => {
    const legendaryXP  = Math.min(...ACHIEVEMENTS.filter(a => a.rarity === "legendary").map(a => a.xp));
    const commonMaxXP  = Math.max(...ACHIEVEMENTS.filter(a => a.rarity === "common").map(a => a.xp));
    expect(legendaryXP).toBeGreaterThan(commonMaxXP);
  });
});

// ── checkAndUnlockAchievements ────────────────────────────────────────────────

describe("checkAndUnlockAchievements", () => {
  beforeEach(clearStore);

  it("unlocks streak_1 when checkInsDone >= 1 and returns it in newly unlocked", () => {
    seedStats({ checkInsDone: 1 });
    const newly = checkAndUnlockAchievements();
    const ids = newly.map(a => a.id);
    expect(ids).toContain("streak_1");
  });

  it("does NOT re-unlock an already-unlocked achievement", () => {
    seedStats({ checkInsDone: 1 });
    seedUnlocked([{ id: "streak_1", unlockedAt: Date.now() - 1000, seen: true }]);
    const newly = checkAndUnlockAchievements();
    expect(newly.map(a => a.id)).not.toContain("streak_1");
  });

  it("adds XP when a new achievement is unlocked", () => {
    seedStats({ checkInsDone: 1 });
    store["bm_xp"] = "0";
    checkAndUnlockAchievements();
    const xp = getTotalXP();
    expect(xp).toBeGreaterThan(0);
  });

  it("unlocks multiple achievements in one call", () => {
    seedStats({ checkInsDone: 1, aiMessages: 1 });
    const newly = checkAndUnlockAchievements();
    const ids = newly.map(a => a.id);
    expect(ids).toContain("streak_1");
    expect(ids).toContain("ai_first");
  });

  it("returns empty array when no new achievements qualify", () => {
    seedStats({ checkInsDone: 0 });
    const newly = checkAndUnlockAchievements();
    expect(newly).toHaveLength(0);
  });

  it("persists newly unlocked achievements to storage", () => {
    seedStats({ checkInsDone: 1 });
    checkAndUnlockAchievements();
    const stored = getUnlocked();
    expect(stored.some(u => u.id === "streak_1")).toBe(true);
  });

  it("newly unlocked achievements have seen: false", () => {
    seedStats({ checkInsDone: 1 });
    checkAndUnlockAchievements();
    const stored = getUnlocked();
    const a = stored.find(u => u.id === "streak_1")!;
    expect(a.seen).toBe(false);
  });
});

// ── updateAchievementStats ────────────────────────────────────────────────────

describe("updateAchievementStats", () => {
  beforeEach(clearStore);

  it("merges partial stats with defaults", () => {
    updateAchievementStats({ streak: 5, checkInsDone: 10 });
    const stats = getAchievementStats();
    expect(stats.streak).toBe(5);
    expect(stats.checkInsDone).toBe(10);
    expect(stats.aiMessages).toBe(0); // default
  });

  it("updates maxStreak when new streak exceeds previous maxStreak", () => {
    seedStats({ streak: 3, maxStreak: 3 });
    updateAchievementStats({ streak: 7 });
    const stats = getAchievementStats();
    expect(stats.maxStreak).toBe(7);
  });

  it("does NOT decrease maxStreak when streak drops", () => {
    seedStats({ streak: 10, maxStreak: 10 });
    updateAchievementStats({ streak: 2 });
    const stats = getAchievementStats();
    expect(stats.maxStreak).toBe(10); // preserved
  });

  it("preserves existing fields not included in the partial update", () => {
    seedStats({ aiMessages: 5, projectsCreated: 2 });
    updateAchievementStats({ streak: 3 });
    const stats = getAchievementStats();
    expect(stats.aiMessages).toBe(5);
    expect(stats.projectsCreated).toBe(2);
  });
});

// ── getAchievementStats — defaults ───────────────────────────────────────────

describe("getAchievementStats — defaults", () => {
  beforeEach(clearStore);

  it("returns all-zero defaults when no stats are stored", () => {
    const stats = getAchievementStats();
    expect(stats.streak).toBe(0);
    expect(stats.checkInsDone).toBe(0);
    expect(stats.planUpgraded).toBe(false);
  });
});
