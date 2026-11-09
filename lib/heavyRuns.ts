/**
 * lib/heavyRuns.ts — rules for "heavy" runs (Lead Finder, Demand Check). Pure and unit-tested.
 *
 * A heavy run reads dozens of pages and makes several model calls, so it must not count as one ordinary AI call.
 * Goals: Builders get real, generous use; the rest of the app (Today, Coach, onboarding) never slows down because
 * of heavy runs. So heavy runs have their own daily cap, a cap on how many run at once across everyone, and they
 * are the first thing shed when the system is busy. Nothing here ever blocks Today, Coach or the daily loop.
 */

export const HEAVY_DAILY_LIMITS: Record<string, number> = { free: 0, trial: 1, builder: 6 };

/** A heavy run is charged to the global AI budget as this many calls (a fair estimate of what it really uses). */
export const HEAVY_WEIGHT = 8;

export const DEFAULT_MAX_CONCURRENT = 4;
/** Above this share of the daily ceiling, heavy runs are paused for everyone, Builders included. */
export const SHED_AT = 0.9;
/** Above this share, heavy runs still start but run in light mode (one round, fewer pages). */
export const LIGHT_AT = 0.7;

export type HeavyDecision =
  | { allowed: true; light: boolean }
  | { allowed: false; reason: string; retryAfterMinutes?: number };

export function maxConcurrent(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.HEAVY_MAX_CONCURRENT);
  return env.HEAVY_MAX_CONCURRENT && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_MAX_CONCURRENT;
}

export function decideHeavy(i: {
  tier: "free" | "trial" | "builder";
  usedToday: number;
  runningNow: number;
  totalToday: number | null; // null = unknown load
  ceiling: number;           // 0 = guard disabled
  maxConcurrent: number;
  paused?: boolean;          // HEAVY_RUNS_PAUSED=1 kill switch
}): HeavyDecision {
  if (i.paused) return { allowed: false, reason: "Deep searches are paused for maintenance. Everything else is working. Try again later.", retryAfterMinutes: 30 };
  const limit = HEAVY_DAILY_LIMITS[i.tier] ?? 0;
  if (limit === 0) return { allowed: false, reason: "Deep searches are part of the Builder plan." };
  if (i.usedToday >= limit) {
    return { allowed: false, reason: `You have used your ${limit} deep ${limit === 1 ? "search" : "searches"} for today. They reset at midnight UTC.` };
  }
  if (i.runningNow >= i.maxConcurrent) {
    return { allowed: false, reason: "Deep searches are busy right now. Try again in a few minutes. Today, Coach and everything else are unaffected.", retryAfterMinutes: 3 };
  }
  if (i.ceiling > 0 && i.totalToday !== null) {
    const share = i.totalToday / i.ceiling;
    if (share >= SHED_AT) return { allowed: false, reason: "The system is very busy, so deep searches are paused for a short while to keep Today and Coach fast. Try again later today.", retryAfterMinutes: 30 };
    if (share >= LIGHT_AT) return { allowed: true, light: true };
  }
  return { allowed: true, light: false };
}
