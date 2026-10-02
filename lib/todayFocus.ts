/**
 * lib/todayFocus.ts
 *
 * Pure, dependency-free logic behind the Today "Command Center":
 *   - the focus-session state machine (start / pause / resume / tick / reset)
 *   - suggested block length parsed from the action's own time estimate
 *   - the "day arc" (how much of the working day is left)
 *   - the nudge line (a deterministic, number-backed sentence — no AI call)
 *
 * Everything takes `now` as an argument so it is trivially testable and the
 * React component stays a thin renderer. The timer stores an absolute `endAt`
 * timestamp rather than counting ticks, so a throttled background tab or a
 * page reload can never drift or lose time.
 */

export const FOCUS_PRESETS = [10, 25, 45] as const;

export type FocusMode = "idle" | "running" | "paused" | "finished";

export interface FocusState {
  /** Local calendar day this state belongs to (YYYY-MM-DD); stale days reset. */
  day: string;
  mode: FocusMode;
  /** Block length in seconds. */
  durationSec: number;
  /** Absolute epoch ms the running block ends. Only meaningful when running. */
  endAt: number | null;
  /** Seconds left when paused. */
  remainingSec: number;
  /** Completed blocks today and their total minutes. */
  blocksToday: number;
  minutesToday: number;
}

export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function freshFocusState(now: Date, minutes = 25): FocusState {
  return { day: localDay(now), mode: "idle", durationSec: minutes * 60, endAt: null, remainingSec: minutes * 60, blocksToday: 0, minutesToday: 0 };
}

/** Rolls the state over at midnight but keeps nothing from yesterday. */
export function normalizeFocusState(state: FocusState | null | undefined, now: Date, fallbackMinutes = 25): FocusState {
  if (!state || state.day !== localDay(now)) return freshFocusState(now, fallbackMinutes);
  // A running block whose end time has passed (tab closed, laptop asleep) is finished, not lost.
  if (state.mode === "running" && state.endAt !== null && state.endAt <= now.getTime()) return finishBlock(state);
  return state;
}

export function startFocus(state: FocusState, minutes: number, now: Date): FocusState {
  const durationSec = Math.round(minutes * 60);
  return { ...state, day: localDay(now), mode: "running", durationSec, endAt: now.getTime() + durationSec * 1000, remainingSec: durationSec };
}

export function pauseFocus(state: FocusState, now: Date): FocusState {
  if (state.mode !== "running" || state.endAt === null) return state;
  return { ...state, mode: "paused", endAt: null, remainingSec: Math.max(0, Math.ceil((state.endAt - now.getTime()) / 1000)) };
}

export function resumeFocus(state: FocusState, now: Date): FocusState {
  if (state.mode !== "paused") return state;
  return { ...state, mode: "running", endAt: now.getTime() + state.remainingSec * 1000 };
}

export function resetFocus(state: FocusState, minutes: number): FocusState {
  const sec = Math.round(minutes * 60);
  return { ...state, mode: "idle", endAt: null, durationSec: sec, remainingSec: sec };
}

export function finishBlock(state: FocusState): FocusState {
  return {
    ...state,
    mode: "finished",
    endAt: null,
    remainingSec: 0,
    blocksToday: state.blocksToday + 1,
    minutesToday: state.minutesToday + Math.round(state.durationSec / 60),
  };
}

/** Seconds currently left (works for every mode). */
export function secondsLeft(state: FocusState, now: Date): number {
  if (state.mode === "running" && state.endAt !== null) return Math.max(0, Math.ceil((state.endAt - now.getTime()) / 1000));
  if (state.mode === "finished") return 0;
  return state.remainingSec;
}

export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * "25 minutes" → 25, "10 min" → 10, "1 hour" → 60, "20-30 minutes" → 30 (upper
 * end: plan for the realistic case). Clamped to 5-90; null if unreadable.
 */
export function parseSuggestedMinutes(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.toLowerCase().match(/(\d+(?:\.\d+)?)(?:\s*(?:-|–|to)\s*(\d+(?:\.\d+)?))?\s*(hours?|hrs?|h\b|minutes?|mins?|m\b)/);
  if (!m) return null;
  const high = Number(m[2] ?? m[1]);
  const isHours = /^h/.test(m[3]);
  const minutes = Math.round(isHours ? high * 60 : high);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  return Math.min(90, Math.max(5, minutes));
}

/** Snap a suggested length to the nearest preset so the buttons stay simple. */
export function nearestPreset(minutes: number): number {
  return FOCUS_PRESETS.reduce((best, p) => (Math.abs(p - minutes) < Math.abs(best - minutes) ? p : best), FOCUS_PRESETS[0]) as number;
}

export interface DayArc {
  /** 0..1 through the 06:00-22:00 working day. */
  progress: number;
  hoursLeft: number;
  minutesLeft: number;
  phase: "early" | "morning" | "afternoon" | "evening" | "late";
}

export function dayArc(now: Date): DayArc {
  const START = 6 * 60, END = 22 * 60;
  const mins = now.getHours() * 60 + now.getMinutes();
  const clamped = Math.min(END, Math.max(START, mins));
  const left = Math.max(0, END - mins);
  const phase: DayArc["phase"] = mins < START ? "early" : mins < 12 * 60 ? "morning" : mins < 17 * 60 ? "afternoon" : mins < END ? "evening" : "late";
  return { progress: (clamped - START) / (END - START), hoursLeft: Math.floor(left / 60), minutesLeft: left % 60, phase };
}

export interface NudgeInput {
  now: Date;
  done: boolean;
  streak: number;
  focusMinutesToday: number;
  /** Active days this week vs the same point last week (from the snapshot). */
  activeDaysThisWeek?: number;
  activeDaysLastWeekSamePoint?: number;
  momentumDelta?: number | null;
  suggestedMinutes?: number | null;
}

/** One honest sentence built only from numbers the app really has. */
export function nudgeLine(i: NudgeInput): string {
  const arc = dayArc(i.now);
  const left = arc.hoursLeft > 0 ? `${arc.hoursLeft}h ${arc.minutesLeft}m` : `${arc.minutesLeft}m`;
  if (i.done) {
    const focus = i.focusMinutesToday > 0 ? ` ${i.focusMinutesToday} focused minutes logged.` : "";
    return `Today's action is done${i.streak > 0 ? ` — streak at ${i.streak}` : ""}.${focus} Reflecting now makes tomorrow's task sharper.`;
  }
  if (arc.phase === "late") return i.streak > 0 ? `The day is nearly over and your ${i.streak}-day streak is still open. Even a 10-minute version counts.` : "The day is nearly over. A 10-minute version still counts.";
  if (arc.phase === "evening" && i.streak > 0) return `${left} left today and your ${i.streak}-day streak is on the line${i.suggestedMinutes ? ` — the task is about ${i.suggestedMinutes} minutes` : ""}.`;
  const diff = (i.activeDaysThisWeek ?? 0) - (i.activeDaysLastWeekSamePoint ?? 0);
  if (diff < 0) return `You're ${Math.abs(diff)} active day${Math.abs(diff) === 1 ? "" : "s"} behind the same point last week. Today's action closes ${Math.abs(diff) === 1 ? "it" : "part of that"}.`;
  if (typeof i.momentumDelta === "number" && i.momentumDelta < 0) return `Momentum is down ${Math.abs(i.momentumDelta)} this week — one completed action today starts turning it.`;
  if (diff > 0) return `You're ${diff} active day${diff === 1 ? "" : "s"} ahead of last week's pace. Keep the chain going.`;
  return `${left} left in your day${i.suggestedMinutes ? ` and the task is about ${i.suggestedMinutes} minutes` : ""}. Start a focus block and protect it.`;
}
