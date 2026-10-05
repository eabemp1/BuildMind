/**
 * lib/streak.ts — the ONE definition of "streak" for BuildMind.
 *
 * A streak is the number of consecutive calendar days (ending today, or
 * yesterday if today isn't done yet) on which the founder completed at least
 * one real action. The server owns the count (`founder_context.streak`,
 * written only by `update_streak_atomic`) and the day it was last extended
 * (`founder_context.last_checkin_date`).
 *
 * The stored number only changes when a founder completes something, so by
 * itself it never expires: someone who stopped five days ago would still be
 * shown "12-day streak". Every reader must therefore pass the stored pair
 * through `effectiveStreak` before showing or reasoning about it. Nothing
 * else in the app should compute a streak of its own.
 */

const DAY_MS = 86_400_000;

/** YYYY-MM-DD in UTC — the same clock `update_streak_atomic` is given. */
export function streakDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function dayNumber(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(key);
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null;
}

export interface StreakStatus {
  /** The streak to display and reason about. 0 once it has lapsed. */
  count: number;
  /** An action already counted today. */
  doneToday: boolean;
  /** Alive, but ends tonight unless something is completed today. */
  atRisk: boolean;
  /** A streak existed and has lapsed (missed at least one full day). */
  lapsed: boolean;
  /** The stored value before lapse handling, for "your best/last run". */
  lastRun: number;
  lastCheckinDate: string | null;
}

export function streakStatus(
  stored: number | null | undefined,
  lastCheckinDate: string | null | undefined,
  today: string = streakDayKey(),
): StreakStatus {
  const raw = typeof stored === "number" && Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  const last = lastCheckinDate ? lastCheckinDate.slice(0, 10) : null;
  const base = { lastRun: raw, lastCheckinDate: last };
  if (raw === 0) return { ...base, count: 0, doneToday: false, atRisk: false, lapsed: false };

  const t = dayNumber(today);
  const l = last ? dayNumber(last) : null;
  // A count with no verifiable date cannot be proven current.
  if (t === null || l === null) return { ...base, count: 0, doneToday: false, atRisk: false, lapsed: true };

  const gap = t - l;
  if (gap <= 0) return { ...base, count: raw, doneToday: true, atRisk: false, lapsed: false };
  if (gap === 1) return { ...base, count: raw, doneToday: false, atRisk: true, lapsed: false };
  return { ...base, count: 0, doneToday: false, atRisk: false, lapsed: true };
}

/** Shorthand: just the number to show. */
export function effectiveStreak(
  stored: number | null | undefined,
  lastCheckinDate: string | null | undefined,
  today?: string,
): number {
  return streakStatus(stored, lastCheckinDate, today).count;
}

/**
 * Derive a streak from raw activity days (YYYY-MM-DD). Used only as a
 * cross-check or when the server value is unavailable; the server count wins
 * whenever both exist.
 */
export function streakFromDays(days: Iterable<string>, today: string = streakDayKey()): number {
  const set = new Set<number>();
  for (const d of days) {
    const n = dayNumber(d);
    if (n !== null) set.add(n);
  }
  const t = dayNumber(today);
  if (t === null) return 0;
  let cursor = set.has(t) ? t : t - 1;
  let count = 0;
  while (set.has(cursor)) {
    count++;
    cursor--;
  }
  return count;
}

/**
 * Whole days since the founder last completed something (0 = today).
 * `founder_context.days_inactive` is a counter that only moves when a job
 * runs, so it disagrees with the streak whenever the job is late. The check-in
 * date is the fact; derive from it, falling back to the stored counter only
 * when no date exists.
 */
export function daysSinceActive(
  lastCheckinDate: string | null | undefined,
  storedDaysInactive: number | null | undefined,
  today: string = streakDayKey(),
): number | null {
  const t = dayNumber(today);
  const l = lastCheckinDate ? dayNumber(lastCheckinDate) : null;
  if (t !== null && l !== null) return Math.max(0, t - l);
  return typeof storedDaysInactive === "number" && Number.isFinite(storedDaysInactive) ? Math.max(0, storedDaysInactive) : null;
}
