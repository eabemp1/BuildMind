/**
 * lib/achievements.ts — BuildMind Achievement & Badge System
 *
 * Duolingo-style streaks + Free Fire-style rare/legendary drops.
 * All state stored in localStorage — no backend required.
 */

export type AchievementRarity = "common" | "rare" | "epic" | "legendary";
export type AchievementCategory = "streak" | "tasks" | "ai" | "projects" | "social" | "explorer" | "founder";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  emoji: string;
  rarity: AchievementRarity;
  category: AchievementCategory;
  xp: number;
  secret?: boolean; // hidden until unlocked
  condition: (stats: AchievementStats) => boolean;
}

export interface AchievementStats {
  streak: number;
  maxStreak: number;
  checkInsDone: number;
  aiMessages: number;
  projectsCreated: number;
  reflectionsLogged: number;
  planUpgraded: boolean;
  venturesViewed: boolean;
  breakMyStartupUsed: boolean;
  reportViewed: boolean;
  shareUsed: boolean;
  daysActive: number; // unique days with at least one action
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: number; // timestamp
  seen: boolean;
}

// ── Rarity colours ────────────────────────────────────────────────────────────
export const RARITY_COLORS: Record<AchievementRarity, { bg: string; border: string; text: string; glow: string }> = {
  common:    { bg: "#1c1c1c",      border: "#2a2a2a",      text: "#a0a0a0", glow: "rgba(160,160,160,0.12)" },
  rare:      { bg: "#0f1f3d",      border: "#1e3a6e",      text: "#60a5fa", glow: "rgba(96,165,250,0.18)"  },
  epic:      { bg: "#1a0f3d",      border: "#3b1f7a",      text: "#a78bfa", glow: "rgba(167,139,250,0.22)" },
  legendary: { bg: "#2d1a00",      border: "#7c4a00",      text: "#fbbf24", glow: "rgba(251,191,36,0.28)"  },
};

export const RARITY_LABELS: Record<AchievementRarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary",
};

// ── Achievement definitions ───────────────────────────────────────────────────
export const ACHIEVEMENTS: Achievement[] = [

  // ── Streak ──────────────────────────────────────────────────────────────────
  {
    id: "streak_1", label: "First Flame", description: "Complete your first daily check-in", emoji: "🔥",
    rarity: "common", category: "streak", xp: 50,
    condition: s => s.checkInsDone >= 1,
  },
  {
    id: "streak_3", label: "On Fire", description: "3-day streak", emoji: "🔥",
    rarity: "common", category: "streak", xp: 100,
    condition: s => s.streak >= 3,
  },
  {
    id: "streak_7", label: "Week Warrior", description: "7-day streak — you're building a habit", emoji: "⚔️",
    rarity: "rare", category: "streak", xp: 250,
    condition: s => s.streak >= 7,
  },
  {
    id: "streak_14", label: "Two Week Founder", description: "14-day streak — real founders don't quit", emoji: "🛡️",
    rarity: "rare", category: "streak", xp: 500,
    condition: s => s.streak >= 14,
  },
  {
    id: "streak_30", label: "Iron Founder", description: "30-day streak. Consistency is a superpower.", emoji: "💎",
    rarity: "epic", category: "streak", xp: 1000,
    condition: s => s.streak >= 30,
  },
  {
    id: "streak_100", label: "Centurion", description: "100 consecutive days. Legendary.", emoji: "🏆",
    rarity: "legendary", category: "streak", xp: 5000, secret: true,
    condition: s => s.streak >= 100,
  },

  // ── Tasks ───────────────────────────────────────────────────────────────────
  {
    id: "tasks_5", label: "Getting Started", description: "5 daily check-ins completed", emoji: "✅",
    rarity: "common", category: "tasks", xp: 75,
    condition: s => s.checkInsDone >= 5,
  },
  {
    id: "tasks_10", label: "Action Taker", description: "10 daily check-ins — you show up", emoji: "⚡",
    rarity: "common", category: "tasks", xp: 150,
    condition: s => s.checkInsDone >= 10,
  },
  {
    id: "tasks_25", label: "Momentum Builder", description: "25 check-ins — momentum is real", emoji: "🚀",
    rarity: "rare", category: "tasks", xp: 400,
    condition: s => s.checkInsDone >= 25,
  },
  {
    id: "tasks_50", label: "Half Century", description: "50 check-ins. You're serious.", emoji: "💪",
    rarity: "epic", category: "tasks", xp: 800,
    condition: s => s.checkInsDone >= 50,
  },
  {
    id: "tasks_100", label: "Century Founder", description: "100 actions. You've built something real.", emoji: "🎯",
    rarity: "legendary", category: "tasks", xp: 3000, secret: true,
    condition: s => s.checkInsDone >= 100,
  },

  // ── AI ──────────────────────────────────────────────────────────────────────
  {
    id: "ai_first", label: "First Question", description: "Asked AI Coach your first question", emoji: "🤖",
    rarity: "common", category: "ai", xp: 50,
    condition: s => s.aiMessages >= 1,
  },
  {
    id: "ai_10", label: "AI Native", description: "10 AI coach conversations", emoji: "🧠",
    rarity: "rare", category: "ai", xp: 200,
    condition: s => s.aiMessages >= 10,
  },
  {
    id: "ai_50", label: "Thought Partner", description: "50 AI conversations — you think out loud", emoji: "💭",
    rarity: "epic", category: "ai", xp: 700,
    condition: s => s.aiMessages >= 50,
  },

  // ── Explorer ─────────────────────────────────────────────────────────────────
  {
    id: "explorer_break", label: "Reality Check", description: "Used Break My Startup mode", emoji: "💀",
    rarity: "rare", category: "explorer", xp: 150,
    condition: s => s.breakMyStartupUsed,
  },
  {
    id: "explorer_reflect", label: "Self-Aware", description: "Logged your first reflection", emoji: "🧘",
    rarity: "common", category: "explorer", xp: 75,
    condition: s => s.reflectionsLogged >= 1,
  },
  {
    id: "explorer_report", label: "Data Driven", description: "Viewed your weekly report", emoji: "📊",
    rarity: "rare", category: "explorer", xp: 200,
    condition: s => s.reportViewed,
  },
  {
    id: "explorer_share", label: "Build in Public", description: "Shared your progress publicly", emoji: "📣",
    rarity: "rare", category: "social", xp: 250,
    condition: s => s.shareUsed,
  },
  {
    id: "explorer_ventures", label: "Portfolio Thinker", description: "Explored the Ventures section", emoji: "🗺️",
    rarity: "common", category: "explorer", xp: 75,
    condition: s => s.venturesViewed,
  },

  // ── Projects ─────────────────────────────────────────────────────────────────
  {
    id: "projects_1", label: "Idea Born", description: "Created your first project", emoji: "💡",
    rarity: "common", category: "projects", xp: 100,
    condition: s => s.projectsCreated >= 1,
  },
  {
    id: "projects_3", label: "Serial Builder", description: "Running 3 projects — ambitious", emoji: "🏗️",
    rarity: "epic", category: "projects", xp: 600, secret: true,
    condition: s => s.projectsCreated >= 3,
  },

  // ── Founder ──────────────────────────────────────────────────────────────────
  {
    id: "founder_upgraded", label: "Committed", description: "Upgraded to Builder — you're serious", emoji: "👑",
    rarity: "epic", category: "founder", xp: 500,
    condition: s => s.planUpgraded,
  },
  {
    id: "founder_days_7", label: "Week One Survivor", description: "Active across 7 different days", emoji: "📅",
    rarity: "rare", category: "founder", xp: 300,
    condition: s => s.daysActive >= 7,
  },
  {
    id: "founder_days_30", label: "Habitual Founder", description: "30 days of activity — this is who you are now", emoji: "🧬",
    rarity: "legendary", category: "founder", xp: 2000, secret: true,
    condition: s => s.daysActive >= 30,
  },
  {
    id: "founder_max_streak", label: "Unbroken", description: "Never let your streak die (max streak ≥ current + 10)", emoji: "♾️",
    rarity: "legendary", category: "streak", xp: 4000, secret: true,
    condition: s => s.maxStreak >= 30 && s.maxStreak === s.streak,
  },
];

// ── XP Level system ───────────────────────────────────────────────────────────
export function xpToLevel(xp: number): { level: number; title: string; nextXp: number; progress: number } {
  const thresholds = [
    { level: 1, xp: 0,    title: "Aspiring Founder" },
    { level: 2, xp: 200,  title: "Idea Stage" },
    { level: 3, xp: 500,  title: "Validator" },
    { level: 4, xp: 1000, title: "Builder" },
    { level: 5, xp: 2000, title: "Launcher" },
    { level: 6, xp: 3500, title: "Operator" },
    { level: 7, xp: 5500, title: "Growth Hacker" },
    { level: 8, xp: 8000, title: "Serial Founder" },
    { level: 9, xp: 12000, title: "Venture Founder" },
    { level: 10, xp: 20000, title: "Legendary Founder" },
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
    streak: 0, maxStreak: 0, checkInsDone: 0, aiMessages: 0,
    projectsCreated: 0, reflectionsLogged: 0, planUpgraded: false,
    venturesViewed: false, breakMyStartupUsed: false, reportViewed: false,
    shareUsed: false, daysActive: 0,
  };
}

export function updateAchievementStats(partial: Partial<AchievementStats>): void {
  if (typeof window === "undefined") return;
  const current = getAchievementStats();
  const updated = { ...current, ...partial };
  // Always track max streak
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
declare global {
  interface Window {
    bmAchievements?: {
      stats: typeof getAchievementStats;
      unlocked: typeof getUnlocked;
      xp: typeof getTotalXP;
      reset: () => void;
    };
  }
}
if (typeof window !== "undefined") {
  window.bmAchievements = {
    stats: getAchievementStats,
    unlocked: getUnlocked,
    xp: getTotalXP,
    reset: () => {
      ["bm_achievements", "bm_achievement_stats", "bm_xp"].forEach(k => localStorage.removeItem(k));
      if (process.env.NODE_ENV === "development") console.log("Achievements reset.");
    },
  };
}
