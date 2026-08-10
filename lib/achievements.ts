/**
 * lib/achievements.ts — BuildMind Achievement & Badge System
 *
 * Duolingo-style streaks + Free Fire-style rare/legendary drops.
 * All state stored via the user-scoped storage wrapper (lib/storage.ts).
 */

import { storage } from "@/lib/storage";
import { fetchBehaviorState, persistBehaviorState } from "@/lib/userBehaviorState";

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
  for (let i = 0; i < thresholds.length; i++) {
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
  return storage.getJSON<UnlockedAchievement[]>(STORAGE_KEY, []);
}

function saveUnlocked(list: UnlockedAchievement[]): void {
  storage.setJSON(STORAGE_KEY, list);
  persistBehaviorState({ achievements_unlocked: list });
}

export function getTotalXP(): number {
  if (typeof window === "undefined") return 0;
  return Number(storage.get(XP_KEY) ?? "0");
}

// FIX (security audit): this function previously POSTed {amount, reason}
// directly to /api/user/xp, which trusted the client-supplied amount
// (capped at 500/call, but 20 calls/hour = 10,000 XP/hour indefinitely —
// a real, exploitable forgery path). XP for achievements is now granted
// server-side inside POST /api/achievements, using the achievement's own
// canonical xp value — never a client-supplied number. This function now
// ONLY updates the local optimistic display value for instant UI feedback;
// it does not (and must not) independently tell the server how much XP to
// grant. The actual authoritative value still comes from
// getFounderScorecard() / the scorecard endpoint, same as before.
function updateLocalXPDisplay(amount: number): void {
  const next = getTotalXP() + amount;
  storage.set(XP_KEY, String(next));
}

export function getAchievementStats(): AchievementStats {
  if (typeof window === "undefined") return defaultStats();
  return { ...defaultStats(), ...storage.getJSON<Partial<AchievementStats>>(STATS_KEY, {}) };
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
  if ((partial.streak ?? 0) > current.maxStreak) updated.maxStreak = partial.streak!;
  storage.setJSON(STATS_KEY, updated);
  persistBehaviorState({ achievement_stats: updated });
}

export async function syncAchievementsFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  const [behavior, xpRes] = await Promise.allSettled([
    fetchBehaviorState<{
      achievements_unlocked: UnlockedAchievement[];
      achievement_stats: Partial<AchievementStats>;
    }>(["achievements_unlocked", "achievement_stats"]),
    fetch("/api/user/xp", { cache: "no-store" }),
  ]);

  if (behavior.status === "fulfilled") {
    if (Array.isArray(behavior.value.achievements_unlocked)) {
      storage.setJSON(STORAGE_KEY, behavior.value.achievements_unlocked);
    }
    if (behavior.value.achievement_stats && typeof behavior.value.achievement_stats === "object") {
      storage.setJSON(STATS_KEY, { ...defaultStats(), ...behavior.value.achievement_stats });
    }
  }

  if (xpRes.status === "fulfilled" && xpRes.value.ok) {
    const payload = await xpRes.value.json().catch(() => null) as { xp?: number } | null;
    if (typeof payload?.xp === "number") storage.set(XP_KEY, String(payload.xp));
  }
}

/** Returns newly unlocked achievements (call after any stat update).
 *
 * FIX: this used to write EVERY locally-computed candidate straight to
 * localStorage and fire the server POST as pure fire-and-forget
 * (`.catch(() => {})`, no `.then()` at all) — so a client/server stats
 * disagreement meant an achievement could show as unlocked locally
 * forever without a real row ever existing in user_achievements. The
 * moment localStorage was cleared (cache clear, new device, PWA
 * reinstall), it would vanish with no server copy to restore it from —
 * the "achievements just reset" symptom. Now this awaits the server's
 * response and only commits to localStorage (and only returns for the
 * toast) whatever the server actually verified and persisted.
 */
export async function checkAndUnlockAchievements(): Promise<Achievement[]> {
  if (typeof window === "undefined") return [];
  const stats = getAchievementStats();
  const unlocked = getUnlocked();
  const unlockedIds = new Set(unlocked.map(u => u.id));
  const candidates: Achievement[] = [];

  for (const achievement of ACHIEVEMENTS) {
    if (!unlockedIds.has(achievement.id) && achievement.condition(stats)) {
      candidates.push(achievement);
    }
  }

  if (candidates.length === 0) return [];

  let verifiedIds: string[] = [];
  try {
    const res = await fetch("/api/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: candidates.map((a) => a.id) }),
    });
    if (res.ok) {
      const data = await res.json().catch(() => null) as { verifiedIds?: string[] } | null;
      verifiedIds = Array.isArray(data?.verifiedIds) ? data.verifiedIds : [];
    }
  } catch {
    // Network failure — don't commit anything locally that the server
    // hasn't confirmed. Next call (next stat update) will retry.
    return [];
  }

  const newlyUnlocked = candidates.filter((a) => verifiedIds.includes(a.id));
  if (newlyUnlocked.length > 0) {
    for (const achievement of newlyUnlocked) {
      unlocked.push({ id: achievement.id, unlockedAt: Date.now(), seen: false });
      updateLocalXPDisplay(achievement.xp);
    }
    saveUnlocked(unlocked);
    // Page-coherence: notify same-tab listeners (e.g. Today's header XP
    // chip) that something changed. localStorage's own "storage" event
    // only fires in OTHER tabs, never the tab that made the write, so
    // without this a same-tab UI has no way to know XP/level just moved.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("bm_achievement_unlocked", { detail: { newlyUnlocked } }));
    }
  }
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
      [STORAGE_KEY, STATS_KEY, XP_KEY].forEach(k => storage.remove(k));
      if (process.env.NODE_ENV === "development") console.log("Achievements reset.");
    },
  };
              }
