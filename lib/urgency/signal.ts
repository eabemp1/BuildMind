/**
 * lib/urgency/signal.ts — Urgency signal computation
 *
 * Extracted from lib/urgency.ts monolith.
 * Responsible for: computeUrgencySignal, getMissedDayCost.
 * Pure logic — reads from storage helpers, produces typed signals.
 * No fetch calls, no side effects.
 */

import { storage } from "@/lib/storage";
import { getScoreHistory } from "@/lib/scoring";
import type { UrgencySignal } from "./types";
import { STREAK_KEY, getLastActiveDate, todayStr, daysBetween } from "./activeDate";
import { getTaskDebt } from "./taskDebt";

function getYesterdayScore(): number | null {
  if (typeof globalThis.window === "undefined") return null;
  const history = getScoreHistory();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  return history.find(h => h.date === yesterday)?.score ?? null;
}

function none(streak: number, taskDebt: number, momentumDelta: number): UrgencySignal {
  return {
    level: "none", headline: "", subtext: "", cta: "", ctaHref: "/today",
    streak, daysMissed: 0, taskDebt, momentumDelta,
  };
}

export function computeUrgencySignal(currentScore: number): UrgencySignal {
  if (typeof globalThis.window === "undefined") return none(0, 0, 0);

  const streak      = Number(storage.get(STREAK_KEY) ?? "0");
  const lastActive  = getLastActiveDate();
  const today       = todayStr();
  const daysMissed  = lastActive ? Math.max(0, daysBetween(lastActive, today)) : 0;
  const taskDebt    = getTaskDebt();
  const ysScore     = getYesterdayScore();
  const momentumDelta = ysScore !== null ? currentScore - ysScore : 0;

  if (daysMissed >= 3) {
    return {
      level: "critical",
      headline: `${daysMissed} days without building`,
      subtext: "Your competitors didn't stop. Every day you're away, the gap widens.",
      cta: "Do today's action", ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (daysMissed === 2 && streak >= 5) {
    return {
      level: "critical",
      headline: `${streak}-day streak at risk`,
      subtext: "You've built something worth protecting. One session saves it.",
      cta: "Save your streak", ctaHref: "/today",
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
      cta: "Rebuild momentum", ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (taskDebt >= 3) {
    return {
      level: "medium",
      headline: `${taskDebt} tasks carried over`,
      subtext: "Unfinished work compounds. Clear the debt before adding more.",
      cta: "Clear your backlog", ctaHref: "/projects",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (momentumDelta < -4) {
    return {
      level: "medium",
      headline: "Momentum drifting down",
      subtext: "Small slips compound. Stay consistent today.",
      cta: "Do today's action", ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  if (streak >= 7 && daysMissed === 0) {
    return {
      level: "low",
      headline: `${streak}-day streak — don't break it today`,
      subtext: "The longer the streak, the more it's worth protecting.",
      cta: "Log today's action", ctaHref: "/today",
      streak, daysMissed, taskDebt, momentumDelta,
    };
  }

  return none(streak, taskDebt, momentumDelta);
}

export function getMissedDayCost(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("idea"))       return "One missed conversation is one fewer data point before you build the wrong thing.";
  if (s.includes("valid"))      return "Your competitors are talking to the same users right now.";
  if (s.includes("proto") || s.includes("mvp")) return "Every day without user feedback is a day building on assumptions.";
  if (s.includes("launch"))     return "Distribution windows close fast. Inaction in launch stage is expensive.";
  if (s.includes("revenue") || s.includes("growth")) return "Churn doesn't pause. Growth without daily action reverses.";
  return "Momentum is fragile at this stage. Daily action is the only compound interest that matters.";
}
