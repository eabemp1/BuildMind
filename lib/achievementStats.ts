/**
 * lib/achievementStats.ts
 *
 * FIX for Finding A.1 (BuildMind_Feature_Debugging_Audit_2026-07-22.md):
 * "Achievement unlocks are decided client-side; the server just believes
 * whatever it's told."
 *
 * This module is the server's OWN answer to "what has this founder actually
 * done", built from tables the client cannot write to directly (founder_context
 * counters written only by lib/scorecard.ts server functions, and row counts
 * in reflections / projects / ai_usage / project_analyses / weekly_reports).
 * app/api/achievements/route.ts must call getServerAchievementStats() and
 * re-run each Achievement's condition() against THIS, never against a stats
 * object the client sent in the request body.
 *
 * Honest limitations (documented rather than hidden):
 *   - maxStreak: there is no dedicated "best streak ever" column. We use the
 *     current streak as a floor — this can UNDER-count (a founder who broke
 *     a 30-day streak months ago and is now at day 2 won't get credit for
 *     the historical max), but it can never OVER-count, which is the
 *     direction that matters for a trust-boundary fix. A dedicated
 *     `founder_context.max_streak` column would fix the undercount and is a
 *     reasonable follow-up, not required to close this vulnerability.
 *   - venturesViewed / reportViewed / shareUsed: these are page-view/share
 *     events with no dedicated tracking table in the current schema. We
 *     approximate with the closest real signal (existence of a venture_tracks
 *     row / weekly_reports row) rather than trusting a client-supplied
 *     boolean. This is a reasonable proxy, not a perfect one — flagging it
 *     here so it isn't mistaken for a fully solved problem.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { getPlanContext } from "@/lib/server/plan";
import type { AchievementStats } from "@/lib/achievements";

type Admin = ReturnType<typeof createAdminClient>;

/** Total AI requests ever made. ai_usage keeps one row per month, so counting rows counted months, not requests. */
async function countAIRequests(admin: Admin, userId: string): Promise<number> {
  const v2 = await admin.from("ai_usage_by_month").select("count").eq("user_id", userId);
  if (!v2.error && Array.isArray(v2.data)) return (v2.data as Array<{ count: number | null }>).reduce((n, r) => n + (Number(r.count) || 0), 0);
  const legacy = await admin.from("ai_usage").select("*").eq("user_id", userId);
  if (legacy.error || !Array.isArray(legacy.data)) return 0;
  return (legacy.data as Array<Record<string, unknown>>).reduce((n, r) => n + (Number(r.count ?? r.call_count ?? 0) || 0), 0);
}

/** Distinct calendar days (UTC) with at least one logged action. */
async function countActiveDays(admin: Admin, userId: string): Promise<number> {
  const { data } = await admin.from("action_logs").select("created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  return new Set((data ?? []).map((r: { created_at: string }) => String(r.created_at).slice(0, 10))).size;
}

export async function getServerAchievementStats(
  userId: string,
  _plan?: string, // kept so existing callers still compile; the paid check below reads the real subscription
): Promise<AchievementStats> {
  const admin = createAdminClient();

  const [
    founderContextRes,
    projectsCountRes,
    reflectionsCountRes,
    aiRequests,
    breakMyStartupRes,
    breakRunsRes,
    ventureTrackRes,
    weeklyReportRes,
    sharedRes,
    activeDays,
    planCtx,
  ] = await Promise.all([
    admin.from("founder_context").select("streak, tasks_completed_total").eq("user_id", userId).maybeSingle(),
    admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", userId),
    countAIRequests(admin, userId),
    admin.from("break_predictions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("break_runs").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("venture_tracks").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("weekly_reports").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("break_shares").select("token", { count: "exact", head: true }).eq("user_id", userId),
    countActiveDays(admin, userId),
    getPlanContext(userId),
  ]);

  const streak = founderContextRes.data?.streak ?? 0;
  const checkInsDone = founderContextRes.data?.tasks_completed_total ?? 0;

  return {
    streak,
    // No "best streak ever" column exists, so the current streak is the floor: it can under-count, never over-count.
    maxStreak: streak,
    checkInsDone,
    aiMessages: aiRequests,
    projectsCreated: projectsCountRes.count ?? 0,
    reflectionsLogged: reflectionsCountRes.count ?? 0,
    // A free trial is Builder-level access, but it is not an upgrade.
    planUpgraded: planCtx.plan !== "free" && !planCtx.trial,
    venturesViewed: (ventureTrackRes.count ?? 0) > 0,
    breakMyStartupUsed: (breakMyStartupRes.count ?? 0) > 0 || (breakRunsRes.count ?? 0) > 0,
    // A weekly report exists once one has been generated; there is no per-view record.
    reportViewed: (weeklyReportRes.count ?? 0) > 0,
    shareUsed: (sharedRes.count ?? 0) > 0,
    daysActive: activeDays,
  };
}
