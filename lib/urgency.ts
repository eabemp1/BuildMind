/**
 * lib/urgency.ts — Daily Obsession / Urgency System
 *
 * Creates meaningful "falling behind" signals without gimmicky gamification.
 * Tracks: last active date, streak risk, momentum decay, task debt.
 *
 * All signals are stored in localStorage (no extra Supabase table needed).
 * Designed to be read on every dashboard/today load.
 */

export type UrgencyLevel = "none" | "low" | "medium" | "high" | "critical";

export type UrgencySignal = {
  level: UrgencyLevel;
  headline: string;       // short, direct — shown in sidebar/dashboard
  subtext: string;        // one sentence of context
  cta: string;            // action label
  ctaHref: string;        // where to send them
  streak: number;
  daysMissed: number;
  taskDebt: number;       // tasks that were pending yesterday and not done
  momentumDelta: number;  // score change since yesterday (negative = bad)
};

const LAST_ACTIVE_KEY  = "bm_last_active_date";
const SCORE_HIST_KEY   = "bm_score_history";    // JSON: [{date, score}]
const TASK_DEBT_KEY    = "bm_task_debt";
const STREAK_KEY       = "bm_streak";

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

// ── Score history ─────────────────────────────────────────────────────────────

export function recordScore(score: number): void {
  if (typeof window === "undefined") return;
  const today = todayStr();
  const raw = localStorage.getItem(SCORE_HIST_KEY);
  const history: {date: string; score: number}[] = raw ? JSON.parse(raw) : [];
  const existing = history.findIndex(h => h.date === today);
  if (existing >= 0) { history[existing].score = score; }
  else { history.push({ date: today, score }); }
  // Keep 30 days
  const trimmed = history.slice(-30);
  localStorage.setItem(SCORE_HIST_KEY, JSON.stringify(trimmed));
}

function getYesterdayScore(): number | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(SCORE_HIST_KEY);
  if (!raw) return null;
  const history: {date: string; score: number}[] = JSON.parse(raw);
  const yesterday = new Date(Date.now() - 86400000);
  const ys = `${yesterday.getFullYear()}-${String(yesterday.getMonth()+1).padStart(2,"0")}-${String(yesterday.getDate()).padStart(2,"0")}`;
  return history.find(h => h.date === ys)?.score ?? null;
}

// ── Active date tracking ──────────────────────────────────────────────────────

export function markActiveToday(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVE_KEY, todayStr());
}

function getLastActiveDate(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(LAST_ACTIVE_KEY);
}

// ── Task debt ─────────────────────────────────────────────────────────────────

export function recordPendingTasks(count: number): void {
  if (typeof window === "undefined") return;
  // Store yesterday's pending as debt if we're on a new day
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

  // Critical: 3+ days missed, or streak broken after 7+
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

  // High: missed yesterday, or score dropped significantly
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

  // Medium: task debt or score drift
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

  // Low: healthy state, no urgency
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

// ── Week consequence text ─────────────────────────────────────────────────────
// Used in the Today page to show what a missed day actually costs.

export function getMissedDayCost(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("idea"))       return "One missed conversation is one fewer data point before you build the wrong thing.";
  if (s.includes("valid"))      return "Your competitors are talking to the same users right now.";
  if (s.includes("proto") || s.includes("mvp")) return "Every day without user feedback is a day building on assumptions.";
  if (s.includes("launch"))     return "Distribution windows close fast. Inaction in launch stage is expensive.";
  if (s.includes("revenue") || s.includes("growth")) return "Churn doesn't pause. Growth without daily action reverses.";
  return "Momentum is fragile at this stage. Daily action is the only compound interest that matters.";
}
