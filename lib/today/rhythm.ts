/**
 * lib/today/rhythm.ts — weekly rhythm and the welcome-back moment.
 *
 * Pure. The daily streak (lib/streak.ts, update_streak_atomic) is left as it is: it already bridges days
 * the founder marked as rest. This adds a gentler view on top of the same real activity: how many weeks in a row
 * had a few active days. Missing four days in a week is allowed. No SQL changes, nothing stored.
 */
import { weekStartOf } from "@/lib/marketWatch/diff";

/** Active days needed for a week to count. Our bar: three of seven, so four days off is fine. */
export const ACTIVE_DAYS_PER_WEEK = 3;
const DAY = 86_400_000;
const ms = (key: string) => Date.parse(`${key}T00:00:00Z`);
const key = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface Rhythm {
  /** Consecutive finished weeks that met the bar, plus this week if it already has. */
  weeks: number;
  /** Distinct active days so far this week. */
  thisWeek: number;
  /** Whole days since the last active day, null when there is none. */
  daysSince: number | null;
}

export function weeklyRhythm(activeDays: readonly string[], now: Date = new Date()): Rhythm {
  const days = [...new Set(activeDays.map((d) => d.slice(0, 10)))];
  const perWeek = new Map<string, number>();
  for (const d of days) { const w = weekStartOf(new Date(`${d}T00:00:00Z`)); perWeek.set(w, (perWeek.get(w) ?? 0) + 1); }
  const thisStart = weekStartOf(now);
  const thisWeek = perWeek.get(thisStart) ?? 0;
  let weeks = thisWeek >= ACTIVE_DAYS_PER_WEEK ? 1 : 0;
  // This week still in progress never breaks the chain; each finished week before it must have met the bar.
  for (let w = ms(thisStart) - 7 * DAY; ; w -= 7 * DAY) {
    if ((perWeek.get(key(w)) ?? 0) >= ACTIVE_DAYS_PER_WEEK) weeks++; else break;
  }
  const last = days.sort().at(-1);
  const today = ms(now.toISOString().slice(0, 10));
  return { weeks, thisWeek, daysSince: last ? Math.max(0, Math.round((today - ms(last)) / DAY)) : null };
}

export type WelcomeKind = "back" | "week";
export interface Welcome { kind: WelcomeKind; id: string; text: string }

/** After a gap of three or more days, or on a Monday with nothing done yet. Never mentions what was missed. */
export function welcomeMoment(r: Rhythm, now: Date = new Date()): Welcome | null {
  if (r.daysSince === null) return null;
  const week = weekStartOf(now);
  if (r.daysSince >= 3) return { kind: "back", id: `back:${now.toISOString().slice(0, 10)}`, text: "Welcome back. Start with one small step. The rest can wait." };
  if (now.getUTCDay() === 1 && r.thisWeek === 0) return { kind: "week", id: `week:${week}`, text: "A new week. One action is enough to start it." };
  return null;
}

export function rhythmLabel(r: Rhythm): string {
  return r.weeks > 0 ? `Rhythm: ${r.weeks} ${r.weeks === 1 ? "week" : "weeks"}` : "";
}
