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
import type { AchievementStats } from "@/lib/achievements";

export async function getServerAchievementStats(
  userId: string,
  plan: string,
): Promise<AchievementStats> {
  const admin = createAdminClient();

  const [
    founderContextRes,
    projectsCountRes,
    reflectionsCountRes,
    aiUsageCountRes,
    breakMyStartupRes,
    ventureTrackRes,
    weeklyReportRes,
  ] = await Promise.all([
    admin
      .from("founder_context")
      .select("streak, tasks_completed_total")
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("projects").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("reflections").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("project_analyses").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("venture_tracks").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("weekly_reports").select("id", { count: "exact", head: true }).eq("user_id", userId),
  ]);

  const streak = founderContextRes.data?.streak ?? 0;
  const checkInsDone = founderContextRes.data?.tasks_completed_total ?? 0;

  return {
    streak,
    // See "Honest limitations" above — undercounts, never overcounts.
    maxStreak: streak,
    checkInsDone,
    aiMessages: aiUsageCountRes.count ?? 0,
    projectsCreated: projectsCountRes.count ?? 0,
    reflectionsLogged: reflectionsCountRes.count ?? 0,
    planUpgraded: plan !== "free",
    venturesViewed: (ventureTrackRes.count ?? 0) > 0,
    breakMyStartupUsed: (breakMyStartupRes.count ?? 0) > 0,
    reportViewed: (weeklyReportRes.count ?? 0) > 0,
    shareUsed: (weeklyReportRes.count ?? 0) > 0,
    // No unique-days tracking exists yet; conservative floor from check-ins.
    daysActive: checkInsDone,
  };
  }
