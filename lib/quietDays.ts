/**
 * lib/quietDays.ts — a founder may rest one day without losing the streak.
 *
 * Why: the more a productivity app piles on, the more likely a tired person is to quit it. A streak
 * that breaks on the first rest day punishes exactly the founder who needs a break and would return.
 *
 * Rules (kept small on purpose so it cannot become a way to fake a streak):
 *  - at most ONE quiet day in any 7 days
 *  - only for today (not past days, so history cannot be rewritten) or tomorrow
 *  - a quiet day bridges a gap but does not add to the count
 *  - on a quiet day BuildMind sends no nudges
 * The database function update_streak_atomic applies the same bridge (migration 20261024000000).
 * Pure helpers, client-safe.
 */

const DAY = 86_400_000;
export const QUIET_WINDOW_DAYS = 7;
const KEEP_DAYS = 60;

function n(key: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key ?? ""));
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isFinite(t) ? Math.floor(t / DAY) : null;
}
export function dayKeyFrom(num: number): string { return new Date(num * DAY).toISOString().slice(0, 10); }

/** Clean list: valid dates only, unique, oldest dropped after 60 days. */
export function normalizeQuietDays(days: unknown, today: string): string[] {
  const t = n(today);
  if (!Array.isArray(days) || t === null) return [];
  const set = new Set<number>();
  for (const d of days) { const v = n(String(d)); if (v !== null && v >= t - KEEP_DAYS) set.add(v); }
  return [...set].sort((a, b) => a - b).map(dayKeyFrom);
}

export function isQuietDay(days: unknown, day: string): boolean {
  const v = n(day);
  return v !== null && Array.isArray(days) && days.some((d) => n(String(d)) === v);
}

export type QuietCheck = { ok: true } | { ok: false; reason: "invalid_day" | "past_day" | "too_far" | "already_quiet" | "too_soon"; nextAllowed?: string };

/** Whether `target` can be chosen as a quiet day, given today's date (the founder's own local date, UTC-aligned). */
export function canTakeQuietDay(days: unknown, target: string, today: string): QuietCheck {
  const tg = n(target), t = n(today);
  if (tg === null || t === null) return { ok: false, reason: "invalid_day" };
  if (tg < t) return { ok: false, reason: "past_day" };
  if (tg > t + 1) return { ok: false, reason: "too_far" };
  if (isQuietDay(days, target)) return { ok: false, reason: "already_quiet" };
  const list = (Array.isArray(days) ? days : []).map((d) => n(String(d))).filter((x): x is number => x !== null);
  const near = list.filter((d) => Math.abs(d - tg) < QUIET_WINDOW_DAYS);
  if (near.length) return { ok: false, reason: "too_soon", nextAllowed: dayKeyFrom(Math.max(...near) + QUIET_WINDOW_DAYS) };
  return { ok: true };
}

export function addQuietDay(days: unknown, target: string, today: string): string[] {
  return normalizeQuietDays([...(Array.isArray(days) ? days : []), target], today);
}

/** True when every day strictly between `last` and `today` is a quiet day (so the streak survives). */
export function gapIsBridged(last: string, today: string, days: unknown): boolean {
  const l = n(last), t = n(today);
  if (l === null || t === null || t <= l) return false;
  for (let d = l + 1; d < t; d++) if (!isQuietDay(days, dayKeyFrom(d))) return false;
  return true;
}

export const QUIET_REASON_TEXT: Record<string, string> = {
  invalid_day: "That date did not look right.",
  past_day: "A quiet day has to be today or tomorrow.",
  too_far: "A quiet day has to be today or tomorrow.",
  already_quiet: "That day is already quiet.",
  too_soon: "You can take one quiet day in any 7 days.",
};
