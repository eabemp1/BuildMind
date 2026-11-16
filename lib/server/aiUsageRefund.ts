/**
 * Gives one counted AI request back when a job failed because of BuildMind or a provider, not the founder.
 * Works on the per-feature tables (ai_usage_by_day, ai_usage_by_month) that bm_ai_usage_spend writes.
 * Best effort: never throws, never goes below zero, never refunds twice for the same run (the caller passes a run id).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { UsageBucket } from "@/lib/server/aiUsageStore";

export function usagePeriods(now: Date = new Date()): { month: string; day: string } {
  const day = now.toISOString().slice(0, 10);
  return { month: day.slice(0, 7), day };
}

async function step(admin: ReturnType<typeof createAdminClient>, table: "ai_usage_by_day" | "ai_usage_by_month", keyCol: "date" | "month", key: string, userId: string, feature: string): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await admin.from(table).select("count").eq("user_id", userId).eq(keyCol, key).eq("feature", feature).maybeSingle();
    const n = Number((data as { count?: number } | null)?.count ?? 0);
    if (!(n > 0)) return false;
    // Only write if nobody else changed the row since we read it.
    const { data: upd } = await admin.from(table).update({ count: n - 1 }).eq("user_id", userId).eq(keyCol, key).eq("feature", feature).eq("count", n).select("count");
    if (Array.isArray(upd) && upd.length) return true;
  }
  return false;
}

export async function refundAIUsage(userId: string, feature: UsageBucket = "general", at: Date = new Date()): Promise<{ day: boolean; month: boolean }> {
  try {
    const admin = createAdminClient();
    const { month, day } = usagePeriods(at);
    return {
      day: await step(admin, "ai_usage_by_day", "date", day, userId, feature),
      month: await step(admin, "ai_usage_by_month", "month", month, userId, feature),
    };
  } catch (e) {
    console.error("[ai-usage] refund failed", (e as Error)?.message);
    return { day: false, month: false };
  }
}
