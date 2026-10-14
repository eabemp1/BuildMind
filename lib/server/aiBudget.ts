/**
 * lib/server/aiBudget.ts — global daily AI budget guard.
 *
 * BuildMind runs on rate-limited free AI providers, so the real constraint is
 * the TOTAL number of calls per day, not any one user's allowance. Past that
 * point every extra call just makes everyone's request fail.
 *
 * The guard degrades in a fixed order, the way big platforms shed load:
 *   free users    → first to be paused   (≥ 70% of the day's ceiling)
 *   trial users   → next                 (≥ 85%)
 *   public /break → paused with free     (see publicBreakAllowed)
 *   paying users  → NEVER blocked by this guard
 *
 * Set AI_DAILY_CEILING (calls/day across all users) to match what your
 * providers can really serve. 0 disables the guard.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type BudgetTier = "free" | "trial" | "paid" | "public";

export const DEFAULT_DAILY_CEILING = 10000;

/** Fraction of the daily ceiling at which each tier is paused. */
export const TIER_PAUSE_AT: Record<BudgetTier, number> = {
  public: 0.6,
  free: 0.7,
  trial: 0.85,
  paid: Number.POSITIVE_INFINITY,
};

export function dailyCeiling(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AI_DAILY_CEILING;
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_CEILING;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_DAILY_CEILING;
}

export type BudgetDecision = { allowed: true } | { allowed: false; reason: string };

/** Pure decision, unit-tested. ceiling 0 disables the guard. */
export function decideBudget(tier: BudgetTier, totalToday: number, ceiling: number): BudgetDecision {
  if (ceiling <= 0) return { allowed: true };
  const pauseAt = TIER_PAUSE_AT[tier] * ceiling;
  if (totalToday < pauseAt) return { allowed: true };
  return {
    allowed: false,
    reason:
      tier === "trial"
        ? "AI capacity limit reached for trial accounts right now. It frees up shortly, and Builder subscribers are not affected."
        : "AI capacity limit reached for free accounts right now. Try again in a little while, or upgrade to Builder, which is never paused.",
  };
}

export function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

type Totals = { total: number; bucket: number };
let cache: { day: string; total: number; at: number } | null = null;
const CACHE_MS = 15_000;
let warnedMissing = false;

async function rpc(day: string, bucket: BudgetTier, inc: number): Promise<Totals | null> {
  try {
    const { data, error } = await createAdminClient().rpc("bm_ai_global_bump", { p_day: day, p_bucket: bucket, p_inc: inc });
    if (error || !data || typeof data !== "object") {
      if (!warnedMissing) {
        warnedMissing = true;
        console.error("[ai-budget] bm_ai_global_bump unavailable — apply 20261014040000_ai_budget_trial_claims.sql. Guard is open until then.");
      }
      return null;
    }
    const d = data as { total?: number; bucket?: number };
    return { total: Number(d.total ?? 0), bucket: Number(d.bucket ?? 0) };
  } catch {
    return null;
  }
}

/** Today's total across all buckets (15s cache; never throws; null = unknown). */
export async function totalToday(now = new Date()): Promise<number | null> {
  const day = utcDay(now);
  if (cache && cache.day === day && Date.now() - cache.at < CACHE_MS) return cache.total;
  const r = await rpc(day, "paid", 0);
  if (!r) return null;
  cache = { day, total: r.total, at: Date.now() };
  return r.total;
}

/** Throws-free check used before spending a user's allowance. Unknown load = allowed. */
export async function checkBudget(tier: BudgetTier, now = new Date()): Promise<BudgetDecision> {
  const ceiling = dailyCeiling();
  if (ceiling <= 0 || tier === "paid") return { allowed: true };
  const total = await totalToday(now);
  if (total === null) return { allowed: true };
  return decideBudget(tier, total, ceiling);
}

/** Count one AI call. Refreshes the cache from the returned total. Never throws. */
export async function recordCall(tier: BudgetTier, now = new Date()): Promise<void> {
  if (dailyCeiling() <= 0) return;
  const day = utcDay(now);
  const r = await rpc(day, tier, 1);
  if (r) cache = { day, total: r.total, at: Date.now() };
}

/** Test hook. */
export function _resetBudgetCache() {
  cache = null;
  warnedMissing = false;
}

// ── Public /break page ──────────────────────────────────────────────────────

export const DEFAULT_PUBLIC_BREAK_DAILY_CAP = 300;

export function publicBreakCap(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.BREAK_PUBLIC_DAILY_CAP);
  return Number.isFinite(n) && n >= 0 && env.BREAK_PUBLIC_DAILY_CAP !== undefined && env.BREAK_PUBLIC_DAILY_CAP.trim() !== ""
    ? Math.floor(n)
    : DEFAULT_PUBLIC_BREAK_DAILY_CAP;
}

/**
 * Should this anonymous /break request get a live AI analysis?
 * No when today's public calls hit the daily cap OR global load says
 * anonymous traffic should be shed. On "no" the caller serves the
 * no-AI preview instead of an error, so the page still works.
 */
export async function publicBreakAllowed(now = new Date()): Promise<{ live: boolean; why?: "daily_cap" | "capacity" }> {
  const day = utcDay(now);
  const cap = publicBreakCap();
  if (cap === 0) return { live: false, why: "daily_cap" };

  const r = await rpc(day, "public", 0);
  if (!r) return { live: true };
  if (r.bucket >= cap) return { live: false, why: "daily_cap" };

  const ceiling = dailyCeiling();
  if (ceiling > 0 && decideBudget("public", r.total, ceiling).allowed === false) return { live: false, why: "capacity" };
  return { live: true };
}

// ── Admin: current load ─────────────────────────────────────────────────────

export type AILoad = {
  day: string;
  ceiling: number;
  total: number;
  buckets: Record<BudgetTier, number>;
  pct: number;
  status: "ok" | "degrading" | "shedding" | "unknown";
  pausedTiers: BudgetTier[];
};

export function summariseLoad(rows: Array<{ bucket: string; calls: number }>, ceiling: number, day: string): AILoad {
  const buckets: Record<BudgetTier, number> = { free: 0, trial: 0, paid: 0, public: 0 };
  for (const r of rows) if (r.bucket in buckets) buckets[r.bucket as BudgetTier] += Number(r.calls) || 0;
  const total = buckets.free + buckets.trial + buckets.paid + buckets.public;
  const pct = ceiling > 0 ? Math.round((total / ceiling) * 100) : 0;
  const pausedTiers = (["public", "free", "trial"] as BudgetTier[]).filter((t) => ceiling > 0 && !decideBudget(t, total, ceiling).allowed);
  const status = ceiling <= 0 ? "unknown" : pausedTiers.includes("trial") ? "shedding" : pausedTiers.length ? "degrading" : "ok";
  return { day, ceiling, total, buckets, pct, status, pausedTiers };
}

export async function readAILoad(now = new Date()): Promise<AILoad | null> {
  const day = utcDay(now);
  try {
    const { data, error } = await createAdminClient().from("ai_global_daily").select("bucket, calls").eq("day", day);
    if (error || !Array.isArray(data)) return null;
    return summariseLoad(data as Array<{ bucket: string; calls: number }>, dailyCeiling(), day);
  } catch {
    return null;
  }
}
