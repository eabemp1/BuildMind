/**
 * lib/ghostRace.ts — the Ghost Race (pure functions, no I/O).
 *
 * The ghost is YOUR OWN typical week, not a number someone typed in. Each
 * Monday it is set from what you actually finished in recent weeks, so the
 * target is always one you have proof you can reach, and it only moves up
 * after you have held it two weeks running. You race it day by day.
 *
 * Why this and not a fixed "5 tasks, score 70" goal: Today hands out one
 * action a day, so a fixed target either could not be reached or was too easy
 * to mean anything. A target that is derived from your own history is honest
 * when you are new (it starts small), stays reachable, and still stretches.
 *
 * Weeks are Monday-first, UTC, matching weeklyPulseData / weekly_goals.
 */

export const STARTER_GHOST = 3;
export const MIN_GHOST = 2;
export const MAX_GHOST = 7; // one Today action a day

export interface WeekRecord {
  weekStart: string;          // Monday, YYYY-MM-DD
  perDay: number[];           // length 7, Monday first: finished actions per day
  total: number;
}

export interface GhostHistoryEntry {
  weekStart: string;
  total: number;
  ghost: number;
  beat: boolean;
}

export type GhostStatus = "won" | "ahead" | "level" | "behind" | "out_of_reach" | "starting";

export interface GhostRace {
  ghost: number;
  basis: "starter" | "history";
  /** One plain sentence on where the target came from. */
  basisText: string;
  stretched: boolean;
  doneSoFar: number;
  /** 0 = Monday … 6 = Sunday, in the same UTC week as the data. */
  todayIndex: number;
  ghostByDay: number[];       // cumulative ghost at the end of each day (whole numbers)
  youByDay: Array<number | null>; // cumulative actual, null for days that have not happened
  /** done minus where the ghost is by the end of today (negative = behind). */
  delta: number;
  status: GhostStatus;
  remaining: number;
  daysLeft: number;           // days you can still act, including today if nothing done yet
  canStillWin: boolean;
  projected: number;          // pace-based finish, capped at 7
  headline: string;
  detail: string;
  history: GhostHistoryEntry[]; // oldest → newest, completed weeks only
  beatStreak: number;           // consecutive most-recent completed weeks that beat the ghost
  /** Weekday (0=Mon) where you most often fall behind, or null without enough history. */
  slipDay: number | null;
  weeksOfHistory: number;
}

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const dayName = (i: number) => DAY_NAMES[i] ?? "";

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * The ghost for a week, given the completed weeks BEFORE it (oldest → newest).
 * Only weeks with at least one finished action count as history: an empty
 * week usually means a break, and punishing it would set an unreachable bar.
 */
export function ghostTarget(priorWeeks: WeekRecord[]): { ghost: number; basis: "starter" | "history"; stretched: boolean; used: number } {
  const active = priorWeeks.filter((w) => w.total > 0).slice(-4);
  if (active.length < 2) return { ghost: STARTER_GHOST, basis: "starter", stretched: false, used: active.length };
  const base = Math.round(median(active.map((w) => w.total)));
  const lastTwo = active.slice(-2);
  const stretched = lastTwo.every((w) => w.total >= base) && base < MAX_GHOST;
  return { ghost: clamp(base + (stretched ? 1 : 0), MIN_GHOST, MAX_GHOST), basis: "history", stretched, used: active.length };
}

/** Rolls ghostTarget forward through completed weeks to get each week's own ghost. */
export function buildGhostHistory(completedWeeks: WeekRecord[]): GhostHistoryEntry[] {
  const out: GhostHistoryEntry[] = [];
  for (let i = 0; i < completedWeeks.length; i++) {
    const { ghost } = ghostTarget(completedWeeks.slice(0, i));
    const w = completedWeeks[i];
    out.push({ weekStart: w.weekStart, total: w.total, ghost, beat: w.total >= ghost });
  }
  return out;
}

export function weekdayWhereYouSlip(completedWeeks: WeekRecord[]): number | null {
  const weeks = completedWeeks.filter((w) => w.total > 0).slice(-8);
  if (weeks.length < 3) return null;
  const rates = Array.from({ length: 7 }, (_, d) => weeks.filter((w) => (w.perDay[d] ?? 0) > 0).length / weeks.length);
  let worst = 0;
  for (let d = 1; d < 7; d++) if (rates[d] < rates[worst]) worst = d;
  // Only worth saying if it is meaningfully weaker than your best day.
  return Math.max(...rates) - rates[worst] >= 0.25 ? worst : null;
}

export function computeGhostRace(input: {
  /** Completed weeks before this one, oldest → newest. */
  completedWeeks: WeekRecord[];
  /** This week so far. */
  current: WeekRecord;
  /** 0 = Monday … 6 = Sunday (UTC), the day the data was read. */
  todayIndex: number;
}): GhostRace {
  const { completedWeeks, current } = input;
  const todayIndex = clamp(input.todayIndex, 0, 6);
  const t = ghostTarget(completedWeeks);
  const ghost = t.ghost;

  const history = buildGhostHistory(completedWeeks);
  let beatStreak = 0;
  for (let i = history.length - 1; i >= 0 && history[i].beat; i--) beatStreak++;

  const done = current.total;
  const ghostByDay = Array.from({ length: 7 }, (_, i) => Math.round((ghost * (i + 1)) / 7));
  let run = 0;
  const youByDay = current.perDay.slice(0, 7).map((n, i) => {
    run += n;
    return i <= todayIndex ? run : null;
  });
  const doneToday = (current.perDay[todayIndex] ?? 0) > 0;
  const daysLeft = 6 - todayIndex + (doneToday ? 0 : 1);
  const remaining = Math.max(0, ghost - done);
  const canStillWin = remaining <= daysLeft;
  const daysElapsed = todayIndex + (doneToday ? 1 : 0);
  const projected = daysElapsed > 0 ? clamp(Math.round((done / daysElapsed) * 7), done, MAX_GHOST) : done;
  const delta = done - ghostByDay[todayIndex];

  let status: GhostStatus;
  if (done >= ghost) status = "won";
  else if (done === 0 && todayIndex === 0) status = "starting";
  else if (!canStillWin) status = "out_of_reach";
  else if (delta > 0) status = "ahead";
  else if (delta === 0) status = "level";
  else status = "behind";

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  let headline: string;
  let detail: string;
  switch (status) {
    case "won":
      headline = "You beat your ghost.";
      detail = done > ghost ? `${plural(done, "action")} against a ghost of ${ghost}. You are racing ahead of your own record.` : `${plural(done, "action")}, as many as your ghost. Anything more is a new best.`;
      break;
    case "starting":
      headline = "New week, new race.";
      detail = `Your ghost is ${plural(ghost, "action")}. Finish today's and you are level by tonight.`;
      break;
    case "ahead":
      headline = `${plural(delta, "action")} ahead of your ghost.`;
      detail = remaining > 0 ? `${plural(remaining, "more action")} wins the week.` : "";
      break;
    case "level":
      headline = "Level with your ghost.";
      detail = `${plural(remaining, "more action")} wins the week, with ${plural(daysLeft, "day")} left to do it.`;
      break;
    case "behind":
      headline = `${plural(Math.abs(delta), "action")} behind your ghost.`;
      detail = `${plural(remaining, "action")} to win, ${plural(daysLeft, "day")} left. Today's action keeps it alive.`;
      break;
    default:
      headline = "This week's ghost is out of reach.";
      detail = `It needed ${plural(remaining, "more action")} in ${plural(daysLeft, "day")}. Finish what you can; next Monday's ghost is set from this week, so it still counts.`;
  }

  const basisText =
    t.basis === "starter"
      ? `A starter ghost of ${STARTER_GHOST}: three days of showing up. It sets itself from your real weeks once you have two.`
      : `Set from your last ${plural(t.used, "active week")}${t.stretched ? ", plus one because you held it two weeks running" : ""}.`;

  return {
    ghost, basis: t.basis, basisText, stretched: t.stretched,
    doneSoFar: done, todayIndex, ghostByDay, youByDay, delta, status, remaining, daysLeft, canStillWin, projected,
    headline, detail, history, beatStreak,
    slipDay: weekdayWhereYouSlip(completedWeeks),
    weeksOfHistory: completedWeeks.filter((w) => w.total > 0).length,
  };
}
