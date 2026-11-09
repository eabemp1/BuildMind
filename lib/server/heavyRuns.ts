/**
 * lib/server/heavyRuns.ts — admit (or turn away) one heavy run. SERVER-SIDE ONLY.
 * Counts from the runs tables themselves, so no new table is needed. If a lookup fails the run is allowed
 * (never block a paying founder because of our own bookkeeping) but the per-user cap is still checked when it can be.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanContext } from "@/lib/server/plan";
import { dailyCeiling, totalToday, recordCalls, utcDay } from "@/lib/server/aiBudget";
import { decideHeavy, maxConcurrent, HEAVY_WEIGHT, type HeavyDecision } from "@/lib/heavyRuns";

const TABLES = ["lead_runs", "demand_runs"] as const;

export async function admitHeavyRun(userId: string): Promise<HeavyDecision> {
  let tier: "free" | "trial" | "builder" = "free";
  try {
    const ctx = await getPlanContext(userId);
    tier = ctx.plan === "builder" ? (ctx.trial ? "trial" : "builder") : "free";
  } catch { /* treated as free: the route already required Builder, so this only tightens */ }

  const admin = createAdminClient();
  const dayStart = `${utcDay()}T00:00:00.000Z`;
  const recent = new Date(Date.now() - 6 * 60_000).toISOString();
  let usedToday = 0;
  let runningNow = 0;
  try {
    for (const t of TABLES) {
      const [mine, live] = await Promise.all([
        admin.from(t).select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", dayStart),
        admin.from(t).select("id", { count: "exact", head: true }).eq("status", "running").gte("created_at", recent),
      ]);
      usedToday += mine.count ?? 0;
      runningNow += live.count ?? 0;
    }
  } catch { /* counts unknown: fall through with zeros */ }

  const decision = decideHeavy({
    tier, usedToday, runningNow,
    totalToday: await totalToday(),
    ceiling: dailyCeiling(),
    maxConcurrent: maxConcurrent(),
    paused: process.env.HEAVY_RUNS_PAUSED === "1",
  });
  if (decision.allowed) await recordCalls("paid", HEAVY_WEIGHT); // so the global guard sees the real load
  return decision;
}
