/**
 * lib/server/aiUsageStore.ts
 *
 * The ONE place that spends and reads AI usage counters, so enforcement and
 * every usage display read the same numbers.
 *
 * spendAIUsage  — atomic "check daily + monthly cap, then count this call".
 *   1. Preferred: bm_ai_usage_spend (migration 20261002000000), per-bucket.
 *   2. If that function is not deployed yet: the legacy RPCs that earlier
 *      migrations define (shared counters, no buckets) — still counted.
 *   3. If counters cannot be reached at all it THROWS; the caller decides
 *      (free plan fails closed, so a broken counter never means free AI).
 *
 * readAIUsage   — what the badge / banners show. Reads the new tables, falls
 *   back to the legacy table, and tolerates the count/call_count column
 *   mismatch that made the badge show "30 left" no matter how much was used.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { PLAN_MONTHLY_LIMITS, CORE_MONTHLY_LIMITS } from "@/lib/aiLimits";

export type UsageBucket = "general" | "core";

export class AIUsageUnavailableError extends Error {
  constructor() {
    super("AI usage tracking is temporarily unavailable. Please try again in a moment.");
    this.name = "AIUsageUnavailableError";
  }
}

export interface SpendArgs {
  userId: string;
  feature: UsageBucket;
  month: string;       // YYYY-MM (UTC)
  today: string;       // YYYY-MM-DD (UTC)
  monthlyLimit: number; // -1 = unlimited (track only)
  dailyLimit: number;   // -1 = unlimited (track only)
}

export type SpendResult =
  | { ok: true; monthly: number; mode: "v2" | "legacy" }
  | { ok: false; blocked: "daily" | "monthly" };

function isMissingFunction(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const msg = (err.message ?? "").toLowerCase();
  return err.code === "PGRST202" || err.code === "42883" || msg.includes("could not find the function") || msg.includes("function") && msg.includes("does not exist");
}

export async function spendAIUsage(a: SpendArgs): Promise<SpendResult> {
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("bm_ai_usage_spend", {
    p_user_id: a.userId, p_month: a.month, p_date: a.today, p_feature: a.feature,
    p_monthly_limit: a.monthlyLimit, p_daily_limit: a.dailyLimit,
  });
  if (!error && data && typeof data === "object") {
    const r = data as { ok?: boolean; blocked?: string; monthly?: number };
    if (r.ok) return { ok: true, monthly: r.monthly ?? 0, mode: "v2" };
    return { ok: false, blocked: r.blocked === "monthly" ? "monthly" : "daily" };
  }
  if (error && !isMissingFunction(error)) throw new Error(error.message);

  console.error("[ai-usage] bm_ai_usage_spend is not deployed — apply supabase/migrations/20261002000000_ai_usage_by_feature.sql. Using legacy shared counters.");
  return legacySpend(a);
}

async function legacySpend(a: SpendArgs): Promise<SpendResult> {
  const supabase = createAdminClient();

  const daily = await supabase.rpc("increment_ai_usage_daily_capped", { p_user_id: a.userId, p_date: a.today, p_limit: a.dailyLimit });
  if (daily.error) throw new Error(daily.error.message);
  if (daily.data === -1) return { ok: false, blocked: "daily" };

  if (a.monthlyLimit === -1) {
    const tracked = await supabase.rpc("increment_ai_usage", { p_user_id: a.userId, p_month: a.month });
    if (tracked.error) throw new Error(tracked.error.message);
    return { ok: true, monthly: Number(tracked.data ?? 0), mode: "legacy" };
  }

  const monthly = await supabase.rpc("increment_ai_usage_capped", { p_user_id: a.userId, p_month: a.month, p_limit: a.monthlyLimit });
  if (monthly.error) throw new Error(monthly.error.message);
  if (monthly.data === -1) {
    // The monthly cap blocked this call, so hand back the daily slot it took.
    await supabase.rpc("decrement_ai_usage_daily", { p_user_id: a.userId, p_date: a.today });
    return { ok: false, blocked: "monthly" };
  }
  return { ok: true, monthly: Number(monthly.data ?? 0), mode: "legacy" };
}

// ── Reads (display only) ─────────────────────────────────────────────────────

export interface UsageBucketStatus { used: number; limit: number; remaining: number }
export interface AIUsageStatus { general: UsageBucketStatus; core: UsageBucketStatus; source: "v2" | "legacy" | "none" }

function bucket(used: number, limit: number): UsageBucketStatus {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export async function readAIUsage(userId: string, plan: string, now: Date = new Date()): Promise<AIUsageStatus> {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const gLimit = PLAN_MONTHLY_LIMITS[plan] ?? PLAN_MONTHLY_LIMITS.free;
  const cLimit = CORE_MONTHLY_LIMITS[plan] ?? CORE_MONTHLY_LIMITS.free;

  try {
    const admin = createAdminClient();

    const v2 = await admin.from("ai_usage_by_month").select("feature, count").eq("user_id", userId).eq("month", month);
    if (!v2.error && Array.isArray(v2.data)) {
      let general = 0, core = 0;
      for (const r of v2.data as Array<{ feature: string; count: number }>) {
        if (r.feature === "core") core += r.count ?? 0; else general += r.count ?? 0;
      }
      // Calls counted before this migration was applied live in the legacy table;
      // while both exist, the larger figure is the honest one for each bucket.
      const legacy = await readLegacy(admin, userId, month);
      return { general: bucket(Math.max(general, legacy), gLimit), core: bucket(Math.max(core, legacy), cLimit), source: "v2" };
    }

    const legacy = await readLegacy(admin, userId, month);
    return { general: bucket(legacy, gLimit), core: bucket(legacy, cLimit), source: "legacy" };
  } catch {
    return { general: bucket(0, gLimit), core: bucket(0, cLimit), source: "none" };
  }
}

async function readLegacy(admin: ReturnType<typeof createAdminClient>, userId: string, month: string): Promise<number> {
  // select("*") on purpose: production may have `count`, `call_count`, or both.
  const { data, error } = await admin.from("ai_usage").select("*").eq("user_id", userId).eq("month", month);
  if (error || !Array.isArray(data)) return 0;
  return (data as Array<Record<string, unknown>>).reduce((sum, r) => {
    const n = Number(r.count ?? r.call_count ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);
}
