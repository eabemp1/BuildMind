/**
 * lib/achievements.ts — BuildMind Achievement & Badge System
 *
 * Duolingo-style streaks + Free Fire-style rare/legendary drops.
 * All state stored in localStorage — no backend required.
 *
 * DESIGN PHILOSOPHY (v2):
 * - Common   = real effort, not a tutorial reward (min ~1 week of use)
 * - Rare     = sustained, multi-week consistency
 * - Epic     = months of genuine engagement
 * - Legendary= top-0.1%-of-users territory; most will never see one
 *
 * If a badge can be unlocked on day 1, it has no value.
 */

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";
export type AchievementCategory =
  | "streak"
  | "tasks"
  | "ai"
  | "projects"
  | "social"
  | "explorer"
  | "founder";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  emoji: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  xp: number;
  secret?: boolean;
  condition: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
  streak: number;
  maxStreak: number;
  tasksDone: number;
  aiMessages: number;
  projectsCreated: number;
  reflectionsLogged: number;
  planUpgraded: boolean;
  venturesViewed: boolean;
  breakMyStartupUsed: boolean;
  reportViewed: boolean;
  shareUsed: boolean;
  daysActive: number;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number;
  seen: boolean;
}

export const RARITY_COLORS: Record<AchievementRarity, { bg: string; border: string; text: string; glow: string }> = {
  common:    { bg: "#1c1c1c", border: "#2a2a2a", text: "#a0a0a0", glow: "rgba(160,160,160,0.12)" },
  rare:      { bg: "#0f1f3d", border: "#1e3a6e", text: "#60a5fa", glow: "rgba(96,165,250,0.18)"  },
  epic:      { bg: "#1a0f3d", border: "#3b1f7a", text: "#a78bfa", glow: "rgba(167,139,250,0.22)" },
  legendary: { bg: "#2d1a00", border: "#7c4a00", text: "#fbbf24", glow: "rgba(251,191,36,0.28)"  },
};

export const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary",
};

export const ACHIEVEMENTS: Achievement[] = [

  // ── Streak ──────────────────────────────────────────────────────────────────
  {
    id: "streak_7", label: "Week Warrior", description: "7-day streak — you're building a real habit", emoji: "🔥",
    rarity: "common", category: "streak", xp: 300,
    condition: s => s.streak >= 7,
  },
  {
    id: "streak_14", label: "Two-Week Founder", description: "14 consecutive days — most people quit before this", emoji: "⚔️",
    rarity: "rare", category: "streak", xp: 750,
    condition: s => s.streak >= 14,
  },
  {
    id: "streak_30", label: "Iron Founder", description: "30-day streak. Consistency is a superpower.", emoji: "🛡️",
    rarity: "epic", category: "streak", xp: 2000,
    condition: s => s.streak >= 30,
  },
  {
    id: "streak_60", label: "The Grind", description: "60 consecutive days. You don't break promises.", emoji: "💎",
    rarity: "epic", category: "streak", xp: 4000, secret: true,
    condition: s => s.streak >= 60,
  },
  {
    id: "streak_100", label: "Centurion", description: "100 consecutive days. Legendary focus.", emoji: "🏆",
    rarity: "legendary", category: "streak", xp: 10000, secret: true,
    condition: s => s.streak >= 100,
  },

  // ── Tasks ───────────────────────────────────────────────────────────────────
  {
    id: "tasks_25", label: "Action Taker", description: "25 actions completed — you execute, not just plan", emoji: "⚡",
    rarity: "common", category: "tasks", xp: 400,
    condition: s => s.tasksDone >= 25,
  },
  {
    id: "tasks_50", label: "Momentum Builder", description: "50 actions done — you're in motion", emoji: "🚀",
    rarity: "rare", category: "tasks", xp: 900,
    condition: s => s.tasksDone >= 50,
  },
  {
    id: "tasks_100", label: "Half Century", description: "100 actions. You've built something real.", emoji: "💪",
    rarity: "epic", category: "tasks", xp: 2500, secret: true,
    condition: s => s.tasksDone >= 100,
  },
  {
    id: "tasks_250", label: "Century Founder", description: "250 actions. Relentless execution.", emoji: "🎯",
    rarity: "legendary", category: "tasks", xp: 8000, secret: true,
    condition: s => s.tasksDone >= 250,
  },

  // ── AI ──────────────────────────────────────────────────────────────────────
  {
    id: "ai_25", label: "AI Native", description: "25 AI coach conversations — you think out loud", emoji: "🤖",
    rarity: "common", category: "ai", xp: 350,
    condition: s => s.aiMessages >= 25,
  },
  {
    id: "ai_100", label: "Thought Partner", description: "100 AI conversations — you've built a thinking loop", emoji: "🧠",
    rarity: "rare", category: "ai", xp: 1000,
    condition: s => s.aiMessages >= 100,
  },
  {
    id: "ai_300", label: "Synthesiser", description: "300 AI messages — you treat the coach like a co-founder", emoji: "💭",
    rarity: "epic", category: "ai", xp: 3000, secret: true,
    condition: s => s.aiMessages >= 300,
  },

  // ── Explorer ─────────────────────────────────────────────────────────────────
  {
    id: "explorer_reflect_5", label: "Self-Aware", description: "Logged 5 reflections — you examine, not just execute", emoji: "🧘",
    rarity: "common", category: "explorer", xp: 300,
    condition: s => s.reflectionsLogged >= 5,
  },
  {
    id: "explorer_break", label: "Reality Check", description: "Used Break My Startup after real work (20+ tasks done)", emoji: "💀",
    rarity: "rare", category: "explorer", xp: 600,
    condition: s => s.breakMyStartupUsed && s.tasksDone >= 20,
  },
  {
    id: "explorer_report", label: "Data Driven", description: "Viewed your weekly report after 3+ active weeks", emoji: "📊",
    rarity: "rare", category: "explorer", xp: 500,
    condition: s => s.reportViewed && s.daysActive >= 21,
  },
  {
    id: "explorer_share", label: "Build in Public", description: "Shared progress publicly — after earning it (50+ tasks)", emoji: "📣",
    rarity: "epic", category: "social", xp: 1200,
    condition: s => s.shareUsed && s.tasksDone >= 50,
  },
  {
    id: "explorer_ventures", label: "Portfolio Thinker", description: "Explored Ventures after working on 2+ projects", emoji: "🗺️",
    rarity: "rare", category: "explorer", xp: 500,
    condition: s => s.venturesViewed && s.projectsCreated >= 2,
  },

  // ── Projects ─────────────────────────────────────────────────────────────────
  {
    id: "projects_1_active", label: "Idea Born", description: "Created a project and completed 10 tasks on it", emoji: "💡",
    rarity: "common", category: "projects", xp: 400,
    condition: s => s.projectsCreated >= 1 && s.tasksDone >= 10,
  },
  {
    id: "projects_3", label: "Serial Builder", description: "Running 3 active projects simultaneously", emoji: "🏗️",
    rarity: "epic", category: "projects", xp: 2000, secret: true,
    condition: s => s.projectsCreated >= 3,
  },

  // ── Founder ──────────────────────────────────────────────────────────────────
  {
    id: "founder_upgraded", label: "Committed", description: "Upgraded to Builder — you're investing in yourself", emoji: "👑",
    rarity: "rare", category: "founder", xp: 800,
    condition: s => s.planUpgraded,
  },
  {
    id: "founder_days_14", label: "Fortnight Founder", description: "Active across 14 different calendar days", emoji: "📅",
    rarity: "common", category: "founder", xp: 500,
    condition: s => s.daysActive >= 14,
  },
  {
    id: "founder_days_30", label: "Habitual Founder", description: "30 days of activity. This is who you are now.", emoji: "🧬",
    rarity: "rare", category: "founder", xp: 1500, secret: true,
    condition: s => s.daysActive >= 30,
  },
  {
    id: "founder_days_60", label: "Obsessed", description: "60 active days. You're not trying this — you're doing it.", emoji: "🌋",
    rarity: "epic", category: "founder", xp: 4000, secret: true,
    condition: s => s.daysActive >= 60,
  },
  {
    id: "founder_max_streak", label: "Unbroken", description: "A 30+ day max streak that's still alive today", emoji: "♾️",
    rarity: "legendary", category: "streak", xp: 8000, secret: true,
    condition: s => s.maxStreak >= 30 && s.maxStreak === s.streak,
  },
  {
    id: "founder_complete", label: "The Full Stack", description: "Streaks, tasks, AI, reflections, projects, report — all in one journey", emoji: "🌟",
    rarity: "legendary", category: "founder", xp: 15000, secret: true,
    condition: s =>
      s.streak >= 30 &&
      s.tasksDone >= 100 &&
      s.aiMessages >= 100 &&
      s.reflectionsLogged >= 10 &&
      s.projectsCreated >= 2 &&
      s.reportViewed &&
      s.daysActive >= 30,
  },
];

// ── XP Level system ───────────────────────────────────────────────────────────
export function xpToLevel(xp: number): { level: number; title: string; nextXp: number; progress: number } {
  const thresholds = [
    { level: 1,  xp: 0,     title: "Aspiring Founder"  },
    { level: 2,  xp: 500,   title: "Idea Stage"         },
    { level: 3,  xp: 1500,  title: "Validator"          },
    { level: 4,  xp: 3500,  title: "Builder"            },
    { level: 5,  xp: 7000,  title: "Launcher"           },
    { level: 6,  xp: 13000, title: "Operator"           },
    { level: 7,  xp: 22000, title: "Growth Hacker"      },
    { level: 8,  xp: 35000, title: "Serial Founder"     },
    { level: 9,  xp: 55000, title: "Venture Founder"    },
    { level: 10, xp: 80000, title: "Legendary Founder"  },
  ];

  let current = thresholds[0];
  let next = thresholds[1];
  for (let i = 0; i < thresholds.length - 1; i++) {
    if (xp >= thresholds[i].xp) {
      current = thresholds[i];
      next = thresholds[i + 1] ?? thresholds[thresholds.length - 1];
    }
  }

  const range = next.xp - current.xp;
  const progress = range > 0 ? Math.min(100, Math.round(((xp - current.xp) / range) * 100)) : 100;
  return { level: current.level, title: current.title, nextXp: next.xp, progress };
}

// ── Storage ───────────────────────────────────────────────────────────────────
const STORAGE_KEY = "bm_achievements";
const STATS_KEY   = "bm_achievement_stats";
const XP_KEY      = "bm_xp";

export function getUnlocked(): UnlockedAchievement[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); } catch { return []; }
}

function saveUnlocked(list: UnlockedAchievement[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function getTotalXP(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(XP_KEY) ?? "0");
}

function addXP(amount: number): void {
  const current = getTotalXP();
  localStorage.setItem(XP_KEY, String(current + amount));
}

export function getAchievementStats(): AchievementStats {
  if (typeof window === "undefined") return defaultStats();
  try { return { ...defaultStats(), ...JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}") }; } catch { return defaultStats(); }
}

function defaultStats(): AchievementStats {
  return {
    streak: 0, maxStreak: 0, tasksDone: 0, aiMessages: 0,
    projectsCreated: 0, reflectionsLogged: 0, planUpgraded: false,
    venturesViewed: false, breakMyStartupUsed: false, reportViewed: false,
    shareUsed: false, daysActive: 0,
  };
}

export function updateAchievementStats(partial: Partial<AchievementStats>): void {
  if (typeof window === "undefined") return;
  const current = getAchievementStats();
  const updated = { ...current, ...partial };
  if ((partial.streak ?? 0) > current.maxStreak) updated.maxStreak = partial.streak!;
  localStorage.setItem(STATS_KEY, JSON.stringify(updated));
}

/** Returns newly unlocked achievements (call after any stat update) */
export function checkAndUnlockAchievements(): Achievement[] {
  if (typeof window === "undefined") return [];
  const stats = getAchievementStats();
  const unlocked = getUnlocked();
  const unlockedIds = new Set(unlocked.map(u => u.id));
  const newlyUnlocked: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (!unlockedIds.has(achievement.id) && achievement.condition(stats)) {
      unlocked.push({ id: achievement.id, unlockedAt: Date.now(), seen: false });
      addXP(achievement.xp);
      newlyUnlocked.push(achievement);
    }
  }

  if (newlyUnlocked.length > 0) saveUnlocked(unlocked);
  return newlyUnlocked;
}

export function markAchievementSeen(id: string): void {
  if (typeof window === "undefined") return;
  const unlocked = getUnlocked();
  const idx = unlocked.findIndex(u => u.id === id);
  if (idx !== -1) { unlocked[idx].seen = true; saveUnlocked(unlocked); }
}

export function getUnseenCount(): number {
  return getUnlocked().filter(u => !u.seen).length;
}

// ── Dev helper ────────────────────────────────────────────────────────────────
if (typeof window !== "undefined") {
  (window as any).bmAchievements = {
    stats: getAchievementStats,
    unlocked: getUnlocked,
    xp: getTotalXP,
    reset: () => {
      ["bm_achievements", "bm_achievement_stats", "bm_xp"].forEach(k => localStorage.removeItem(k));
      console.log("Achievements reset.");
    },
  };
}
