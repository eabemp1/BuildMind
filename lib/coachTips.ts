/**
 * lib/coachTips.ts
 *
 * Picks ONE coaching tip from the founder's real numbers (the same snapshot
 * Today uses), or none. No signal, no tip: we never send filler.
 * Pure function so it is easy to test and the "why" is always explainable.
 */

export type CoachTipInput = {
  momentum: number | null;
  momentumDelta: number | null;
  streak: number;
  activeDaysThisWeek: number;
  daysElapsedThisWeek: number;
  activeDaysLastWeekSamePoint: number;
  completedToday: boolean;
  pendingActionTitle: string | null;
  daysInactive: number | null;
  overdueMilestones: number;
  worstOverdue: { title: string; daysLate: number } | null;
  topAvoidance: string | null;
  calibrating: boolean;
};

export type CoachTip = {
  id: string;
  title: string;
  body: string;
  url: string;
  /** The numbers this tip is based on, shown to the founder on request. */
  because: string;
};

export function pickCoachTip(s: CoachTipInput): CoachTip | null {
  if (s.calibrating) return null; // not enough history to say anything true

  if (s.daysInactive !== null && s.daysInactive >= 3 && !s.completedToday) {
    return {
      id: "comeback",
      title: "Make the first step tiny",
      body: `It's been ${s.daysInactive} days. Pick the smallest task you can finish in 10 minutes and start there.`,
      url: "/today",
      because: `${s.daysInactive} days since your last completed action.`,
    };
  }

  if (s.worstOverdue && s.worstOverdue.daysLate >= 3) {
    return {
      id: "overdue",
      title: "One milestone is slipping",
      body: `"${s.worstOverdue.title}" is ${s.worstOverdue.daysLate} days late. Shrink it or move the date, but decide today.`,
      url: "/projects",
      because: `${s.overdueMilestones} overdue milestone${s.overdueMilestones === 1 ? "" : "s"}; the oldest is ${s.worstOverdue.daysLate} days late.`,
    };
  }

  if (s.momentumDelta !== null && s.momentumDelta <= -8) {
    return {
      id: "momentum_drop",
      title: "Your momentum dipped",
      body: `Momentum fell ${Math.abs(Math.round(s.momentumDelta))} points. Finishing one action today stops the slide.`,
      url: "/today",
      because: `Momentum change of ${Math.round(s.momentumDelta)}.`,
    };
  }

  if (s.topAvoidance && s.activeDaysThisWeek >= 2) {
    return {
      id: "avoidance",
      title: "You keep dodging one thing",
      body: `You've been steering around ${s.topAvoidance}. Try just 15 minutes on it first this week.`,
      url: "/founder-mirror",
      because: `Avoidance pattern detected: ${s.topAvoidance}.`,
    };
  }

  if (s.streak >= 7 && s.streak % 7 === 0 && !s.completedToday) {
    return {
      id: "streak_protect",
      title: `Protect your ${s.streak}-day streak`,
      body: "You haven't checked in yet today. One small action keeps it alive.",
      url: "/today",
      because: `${s.streak}-day streak, nothing completed yet today.`,
    };
  }

  if (s.activeDaysThisWeek > s.activeDaysLastWeekSamePoint && s.activeDaysThisWeek >= 3) {
    return {
      id: "ahead_of_last_week",
      title: "You're ahead of last week",
      body: `${s.activeDaysThisWeek} active days so far, up from ${s.activeDaysLastWeekSamePoint} at this point last week. Keep the pace.`,
      url: "/progress",
      because: `${s.activeDaysThisWeek} vs ${s.activeDaysLastWeekSamePoint} active days at the same point last week.`,
    };
  }

  return null;
}
