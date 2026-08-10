/**
 * lib/journeyGamification.ts — XP and level calculation for the Developer
 * Journey (Phase 5, XP/levels slice).
 *
 * Deliberately pure functions with zero I/O — no Supabase, no fetch. Per
 * the master prompt's own cost-control rule (§57), XP and level math is
 * arithmetic, not something to compute with an LLM or hide behind a
 * network call. This also makes the whole file trivially unit-testable
 * (see __tests__/lib/journeyGamification.test.ts) without mocking anything.
 *
 * Persistence (the append-only XP ledger, journey_xp_events) lives in
 * lib/journey.ts, which calls awardXp() below to compute how much to
 * record — this file never touches the database itself.
 *
 * Scope note: this covers XP + levels only (master prompt §18–19).
 * Achievements (§20) and streaks (§17) are deliberately NOT in this slice —
 * achievements live in lib/achievements.ts today as a client-side/
 * localStorage system driven by founder-execution stats; wiring
 * server-graded journey events into that same engine is a real design
 * question (does a journey achievement need its own stats shape? does it
 * unlock through the same UI?) that deserves its own pass rather than
 * being bolted on here to hit "all of Phase 5" in one turn.
 */

export const JOURNEY_XP_VALUES = {
  lesson_completed: 10,
  exercise_completed: 15,
  quiz_passed: 25,
  milestone_completed: 50,
  project_submitted: 100,
  project_passed: 150,
  revision_completed: 75,
  mentor_challenge: 100,
  capstone_milestone: 250,
} as const;

export type JourneyXpEventType = keyof typeof JOURNEY_XP_VALUES;

export function xpForEvent(eventType: JourneyXpEventType): number {
  return JOURNEY_XP_VALUES[eventType];
}

export interface JourneyLevel {
  level: number;
  name: string;
  /** Total XP required to REACH this level (cumulative, not per-level). */
  minXp: number;
}

// Thresholds are spaced so each of the first few projects (100 submit + 150
// pass = 250 XP each) visibly moves the needle, while later levels ask for
// more sustained work — matching the master prompt's 10-level arc (§19)
// without implying professional equivalence at level 10 (explicitly warned
// against in the same section).
export const JOURNEY_LEVELS: JourneyLevel[] = [
  { level: 1, name: "Python Explorer", minXp: 0 },
  { level: 2, name: "Code Apprentice", minXp: 250 },
  { level: 3, name: "Problem Solver", minXp: 600 },
  { level: 4, name: "Builder", minXp: 1100 },
  { level: 5, name: "Software Developer", minXp: 1800 },
  { level: 6, name: "Systems Thinker", minXp: 2700 },
  { level: 7, name: "Production Builder", minXp: 3800 },
  { level: 8, name: "Junior Engineer", minXp: 5100 },
  { level: 9, name: "Independent Developer", minXp: 6600 },
  { level: 10, name: "Software Engineer", minXp: 8300 },
];

export interface LevelProgress {
  level: number;
  levelName: string;
  totalXp: number;
  /** XP earned since reaching the current level. */
  xpIntoLevel: number;
  /** XP still needed to reach the next level; null if already at max level. */
  xpToNextLevel: number | null;
  isMaxLevel: boolean;
}

/**
 * Given a total XP amount, returns the current level and progress toward
 * the next one. Total XP is always the sum of every journey_xp_events row
 * for a student — this function never mutates or reads anything, the
 * caller (lib/journey.ts) is responsible for summing the ledger first.
 */
export function levelForXp(totalXp: number): LevelProgress {
  const safeXp = Math.max(0, Math.floor(totalXp));

  // JOURNEY_LEVELS is ascending by minXp — find the highest level reached.
  let current = JOURNEY_LEVELS[0];
  for (const lvl of JOURNEY_LEVELS) {
    if (safeXp >= lvl.minXp) current = lvl;
    else break;
  }

  const currentIndex = JOURNEY_LEVELS.findIndex((l) => l.level === current.level);
  const next = JOURNEY_LEVELS[currentIndex + 1] ?? null;

  return {
    level: current.level,
    levelName: current.name,
    totalXp: safeXp,
    xpIntoLevel: safeXp - current.minXp,
    xpToNextLevel: next ? next.minXp - safeXp : null,
    isMaxLevel: next === null,
  };
}

// ─── Streaks (derived, never stored — see migration file header) ───────────

export interface StreakResult {
  currentStreak: number;
  longestStreak: number;
}

/**
 * Computes a daily activity streak from a list of ISO 8601 timestamps
 * (any journey_xp_events.created_at values — one per real action). Pure:
 * takes "today" as an explicit parameter rather than reading the clock
 * itself, so it's fully deterministic in tests.
 *
 * "Current streak" counts consecutive calendar days of activity ending
 * either today or yesterday — missing today doesn't zero it out until
 * she's also missed yesterday, so checking in the evening after a busy
 * day doesn't feel punishing (master prompt §17: avoid punishing missed
 * days too harshly).
 */
export function computeStreak(activityTimestamps: string[], today: Date = new Date()): StreakResult {
  if (activityTimestamps.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const toDateKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

  const uniqueDayKeys = Array.from(
    new Set(
      activityTimestamps
        .map((ts) => new Date(ts))
        .filter((d) => !Number.isNaN(d.getTime()))
        .map(toDateKey),
    ),
  ).sort(); // lexicographic sort works because the format is zero-padded ISO-ish

  if (uniqueDayKeys.length === 0) return { currentStreak: 0, longestStreak: 0 };

  const dayKeyToUtcMs = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  // Longest streak: scan for the longest run of consecutive calendar days.
  let longestStreak = 1;
  let runLength = 1;
  for (let i = 1; i < uniqueDayKeys.length; i++) {
    const gap = (dayKeyToUtcMs(uniqueDayKeys[i]) - dayKeyToUtcMs(uniqueDayKeys[i - 1])) / ONE_DAY_MS;
    if (gap === 1) {
      runLength += 1;
    } else {
      runLength = 1;
    }
    longestStreak = Math.max(longestStreak, runLength);
  }

  // Current streak: walk backward from today (or yesterday) through
  // consecutive present days.
  const todayKey = toDateKey(today);
  const yesterdayKey = toDateKey(new Date(today.getTime() - ONE_DAY_MS));
  const daySet = new Set(uniqueDayKeys);

  let anchorMs: number;
  if (daySet.has(todayKey)) {
    anchorMs = dayKeyToUtcMs(todayKey);
  } else if (daySet.has(yesterdayKey)) {
    anchorMs = dayKeyToUtcMs(yesterdayKey);
  } else {
    return { currentStreak: 0, longestStreak };
  }

  let currentStreak = 0;
  let cursor = anchorMs;
  while (daySet.has(toDateKey(new Date(cursor)))) {
    currentStreak += 1;
    cursor -= ONE_DAY_MS;
  }

  return { currentStreak, longestStreak };
}

// ─── Achievements ───────────────────────────────────────────────────────────
//
// A deliberately separate, server-side catalog from lib/achievements.ts —
// that system is client-side/localStorage and driven by founder-execution
// stats (AchievementStats). Journey achievements are graded by a mentor and
// must be tamper-proof, so they're computed server-side from real data and
// persisted permanently in journey_achievements once unlocked (see that
// migration's header for why permanence matters here specifically).

export interface JourneyAchievementStats {
  projectsPassed: number;
  /** module_order values with a "passed" project, e.g. [1,2,3,5]. */
  modulesPassed: number[];
  currentStreak: number;
  longestStreak: number;
  /** True if any skill has ever gone needs_reinforcement -> demonstrated/strong. */
  hasComeback: boolean;
}

export interface JourneyAchievement {
  id: string;
  name: string;
  description: string;
  condition: (stats: JourneyAchievementStats) => boolean;
}

export const JOURNEY_ACHIEVEMENTS: JourneyAchievement[] = [
  {
    id: "first_build",
    name: "First Build",
    description: "Passed your first project.",
    condition: (s) => s.projectsPassed >= 1,
  },
  {
    id: "five_projects",
    name: "Five Projects",
    description: "Passed five projects.",
    condition: (s) => s.projectsPassed >= 5,
  },
  {
    id: "ten_projects",
    name: "Ten Projects",
    description: "Passed ten projects — more than halfway through the curriculum.",
    condition: (s) => s.projectsPassed >= 10,
  },
  {
    id: "persistence",
    name: "Persistence",
    description: "Passed the Personal Finance Tracker — your first project that saves and loads real data.",
    condition: (s) => s.modulesPassed.includes(9),
  },
  {
    id: "object_thinker",
    name: "Object Thinker",
    description: "Passed the Library Management System — your first object-oriented project.",
    condition: (s) => s.modulesPassed.includes(11),
  },
  {
    id: "algorithmic_thinker",
    name: "Algorithmic Thinker",
    description: "Passed the Task Scheduling System — implemented real searching and sorting.",
    condition: (s) => s.modulesPassed.includes(12),
  },
  {
    id: "api_explorer",
    name: "API Explorer",
    description: "Passed the Weather Dashboard — your first project talking to a real API.",
    condition: (s) => s.modulesPassed.includes(15),
  },
  {
    id: "comeback",
    name: "Comeback",
    description: "Turned a 'needs reinforcement' skill into a demonstrated one.",
    condition: (s) => s.hasComeback,
  },
  {
    id: "on_a_roll",
    name: "On a Roll",
    description: "Three days of activity in a row.",
    condition: (s) => s.currentStreak >= 3 || s.longestStreak >= 3,
  },
  {
    id: "two_week_streak",
    name: "Two-Week Streak",
    description: "Fourteen days of activity in a row.",
    condition: (s) => s.longestStreak >= 14,
  },
  {
    id: "capstone",
    name: "Capstone",
    description: "Passed the Complete Python Application Capstone — the full journey.",
    condition: (s) => s.modulesPassed.includes(16),
  },
];
