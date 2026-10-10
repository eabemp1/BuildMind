/**
 * lib/dayKey.ts
 *
 * The Today page decides "is the cached task from today?" by comparing the
 * cache's `date` to the founder's LOCAL calendar day, but the server used to
 * stamp that date in UTC. For anyone not on UTC the two disagree for several
 * hours every day (e.g. Lagos 00:00-01:00, New York evenings), so the cached
 * task was rejected and regenerated on every load: extra AI spend, extra
 * learning-log rows, and a task that changed under the founder.
 *
 * The client now sends its local day key; the server stamps the cache with it.
 * It is only trusted when it is a well-formed date within one day of UTC "now",
 * so a client cannot pin the cache to an arbitrary date.
 */

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function resolveDayKey(raw: unknown, now: Date = new Date()): string {
  const fallback = utcDayKey(now);
  if (typeof raw !== "string" || !DAY_KEY.test(raw)) return fallback;
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(t)) return fallback;
  const utcMidnight = Date.parse(`${fallback}T00:00:00Z`);
  return Math.abs(t - utcMidnight) <= DAY_MS ? raw : fallback;
}
