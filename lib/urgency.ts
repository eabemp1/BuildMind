/**
 * lib/urgency.ts — Daily Obsession / Urgency System
 *
 * Creates meaningful "falling behind" signals without gimmicky gamification.
 * Tracks: last active date, streak risk, momentum decay, task debt.
 *
 * Fix 5 (XP split-brain):
 *   - recordScore() and getYesterdayScore() now read/write via lib/scoring,
 *     which persists to Supabase server-side and keeps localStorage as cache.
 *   - XP is no longer read from localStorage directly here; it's read from
 *     the server-synced cache written by syncXP() in lib/scoring.
 *   - markActiveToday() still writes localStorage for instant UI reads, but
 *     also fires a non-blocking POST to /api/user/score-history to persist
 *     the activity date server-side.
 *
 * Fix 7 (streak/lastActive split-brain):
 *   - syncUrgencyFromServer() seeds STREAK_KEY and LAST_ACTIVE_KEY from
 *     /api/founder-context/streak on app mount. This mirrors what
 *     syncStreakFromServer() in lib/plan does, but also updates LAST_ACTIVE_KEY
 *     so computeUrgencySignal() never thinks the user has been absent on a
 *     fresh device.
 *   - Call syncUrgencyFromServer() alongside syncScoreHistory() on page load.
 *
 * All other signal computation is unchanged.
 */

import { getScoreHistory, recordScore as persistScore } from "@/lib/scoring";

export type UrgencyLevel = "none" | "low" | "medium" | "high" | "critical";

export type UrgencySignal = {
  level: UrgencyLevel;
  headline: string;
  subtext: string;
  cta: string;
  ctaHref: string;
  streak: number;
  daysMissed: number;
  taskDebt: number;
  momentumDelta: number;
};

const LAST_ACTIVE_KEY = "bm_last_active_date";
const TASK_DEBT_KEY   = "bm_task_debt";
const STREAK_KEY      = "bm_streak";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// ── Score history (now via lib/scoring — server-synced) ───────────────────────

/**
 * recordScore — persists score via lib/scoring (writes localStorage + server).
 * Re-exported here so call sites don't need to change their import.
 */
export { recordScore } from "@/lib/scoring";
// Internal alias used in this file:
const _recordScore = persistScore;

function getYesterdayScore(): number | null {
  if (typeof window === "undefined") return null;
  const history = getScoreHistory();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return history.find(h => h.date === yesterday)?.score ?? null;
}

// ── Active date tracking ──────────────────────────────────────────────────────

export function markActiveToday(): void {
  if (typeof window === "undefined") return;
  const today = todayStr();
  localStorage.setItem(LAST_ACTIVE_KEY, today);

  // Persist to server (fire-and-forget) so activity date survives device switch
  fetch("/api/user/score-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // Score 0 just records the activity date; real score recorded separately
    body: JSON.stringify({ date: today, score: 0 }),
  }).catch(() => {});
}

function getLastActiveDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ACTIVE_KEY);
}

/**
 * syncUrgencyFromServer — call on app mount to seed streak + lastActive from
 * Supabase. Mirrors what syncStreakFromServer() in lib/plan does, but also
 * writes LAST_ACTIVE_KEY so computeUrgencySignal() is correct on a fresh device
 * or after a localStorage clear.
 *
 * Strategy: server wins for streak; last_checkin_date maps to lastActive.
 * Does not overwrite a locally-updated streak that is ahead of the server
 * (e.g. the user just incremented it and the POST hasn't synced yet).
 */
export async function syncUrgencyFromServer(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const res = await fetch("/api/founder-context/streak");
    if (!res.ok) return;
    const { streak, lastCheckinDate } = await res.json() as {
      streak?: number;
      lastCheckinDate?: string | null;
    };

    // Only update streak if server knows about a higher or equal value
    if (typeof streak === "number") {
      const local = Number(localStorage.getItem(STREAK_KEY) ?? "0");
      if (streak >= local) {
        localStorage.setItem(STREAK_KEY, String(streak));
      }
    }

    // Seed lastActive from the server's last_checkin_date so a fresh device
    // doesn't incorrectly report the user as absent
    if (typeof lastCheckinDate === "string" && lastCheckinDate) {
      const localActive = localStorage.getItem(LAST_ACTIVE_KEY);
      // Server date wins unless local is more recent (user already logged in today)
      if (!localActive || lastCheckinDate >= localActive) {
        localStorage.setItem(LAST_ACTIVE_KEY, lastCheckinDate);
      }
    }
  } catch { /* non-fatal — localStorage copy is the fallback */ }
}

// ── Task debt ─────────────────────────────────────────────────────────────────

export function recordPendingTasks(count: number): void {
  if (typeof window === "undefined") return;
  const last = getLastActiveDate();
  if (last && last !== todayStr()) {
    localStorage.setItem(TASK_DEBT_KEY, String(count));
  }
}

function getTaskDebt(): number {
  if (typeof window === "undefined") return 0;
  return Number(localStorage.getItem(TASK_DEBT_KEY) ?? "0");
}

// ── Main signal computation ───────────────────────────────────────────────────

export function computeUrgencySignal(currentScore: number): UrgencySignal {
  if (typeof window === "undefined") {
    return none(0, 0, 0);
  }

  const streak     = Number(localStorage.getItem(STREAK_KEY) ?? "0");
  const lastActive = getLastActiveDate();
  const today      = todayStr();
  const daysMissed = lastActive ? Math.max(0, daysBetween(lastActive, today)) : 0;
  const taskDebt   = getTaskDebt();
  const ysScore    = getYesterdayScore();
  const momentumDelta = ysScore !== null ? currentScore - ysScore : 0;

  if (daysMissed >= 3) {
    return {
      level: "critical",
      headline: `${daysMissed} days without building`,
      subtext: "Your competitors didn't stop. Every day you're away, the gap widens.",
      cta: "Do today's action",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (daysMissed === 2 && streak >= 5) {
    return {
      level: "critical",
      headline: `${streak}-day streak at risk`,
      subtext: "You've built something worth protecting. One session saves it.",
      cta: "Save your streak",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (daysMissed === 1) {
    return {
      level: "high",
      headline: streak >= 3 ? `Streak endangered — ${streak} days at stake` : "You missed yesterday",
      subtext: taskDebt > 0
        ? `${taskDebt} task${taskDebt !== 1 ? "s" : ""} from yesterday are still open.`
        : "The best founders don't let a gap become a habit.",
      cta: streak >= 3 ? "Protect your streak" : "Get back on track",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (momentumDelta <= -10) {
    return {
      level: "high",
      headline: `Momentum dropped ${Math.abs(momentumDelta)} points`,
      subtext: "Your score is falling. One strong session reverses this.",
      cta: "Rebuild momentum",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (taskDebt >= 3) {
    return {
      level: "medium",
      headline: `${taskDebt} tasks carried over`,
      subtext: "Unfinished work compounds. Clear the debt before adding more.",
      cta: "Clear your backlog",
      ctaHref: "/projects",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (momentumDelta < -4) {
    return {
      level: "medium",
      headline: "Momentum drifting down",
      subtext: "Small slips compound. Stay consistent today.",
      cta: "Do today's action",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (streak >= 7 && daysMissed === 0) {
    return {
      level: "low",
      headline: `${streak}-day streak — don't break it today`,
      subtext: "The longer the streak, the more it's worth protecting.",
      cta: "Log today's action",
      ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  return none(streak, taskDebt, momentumDelta);
}

function none(streak: number, taskDebt: number, momentumDelta: number): UrgencySignal {
  return {
    level: "none", headline: "", subtext: "", cta: "", ctaHref: "/today",
    streak, daysMissed: 0, taskDebt, momentumDelta,
  };
}

// ── Missed day cost text ──────────────────────────────────────────────────────

export function getMissedDayCost(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("idea"))       return "One missed conversation is one fewer data point before you build the wrong thing.";
  if (s.includes("valid"))      return "Your competitors are talking to the same users right now.";
  if (s.includes("proto") || s.includes("mvp")) return "Every day without user feedback is a day building on assumptions.";
  if (s.includes("launch"))     return "Distribution windows close fast. Inaction in launch stage is expensive.";
  if (s.includes("revenue") || s.includes("growth")) return "Churn doesn't pause. Growth without daily action reverses.";
  return "Momentum is fragile at this stage. Daily action is the only compound interest that matters.";
}
