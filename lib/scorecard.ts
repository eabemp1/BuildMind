/**
 * lib/scorecard.ts — SINGLE SOURCE OF TRUTH for all founder-facing scores.
 *
 * ── Why this file exists (June 30 2026 consolidation) ───────────────────────
 * Before this file, momentum_score, execution_score, streak, and xp were each
 * written from 10-18 different route handlers, with no single function owning
 * any of them. This caused:
 *   - founder_context.xp / streak referenced but never migrated (always 0)
 *   - momentum_score duplicated on both founder_context AND projects, drifting
 *     apart after every cron run
 *   - 13 different files calling computeStartupScore() with differently
 *     constructed input objects (some hardcoding xp: 0, some omitting fields)
 *   - An unbounded momentum accumulator that saturated to 95-100 within days
 *     of normal activity and never moved again
 *
 * ── The contract going forward ───────────────────────────────────────────────
 * READS:  call getFounderScorecard(userId) from any page/route that needs to
 *         DISPLAY momentum, streak, xp, execution score, or the composite
 *         project score. Never read these fields directly off founder_context
 *         or projects in page/route code — always go through this function.
 *
 * WRITES: call grantXP(), updateStreak(), or updateMomentum() — never write
 *         xp/streak/momentum_score directly via .update()/.upsert() outside
 *         this file. This guarantees there is exactly one code path per
 *         metric, so the four pages you compare can never show different
 *         numbers for the same underlying event.
 *
 * projects.momentum_score / projects.execution_score / projects.streak are
 * kept as READ-ONLY MIRRORS for legacy queries (e.g. project_summaries view)
 * but are written exclusively by the functions in this file, in lockstep
 * with founder_context, so they cannot drift.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { momentumLabel, isMomentumDecaying } from "@/lib/momentum";
import { computeStartupScore } from "@/lib/scoring";

export interface FounderScorecard {
  // Raw signals — the truth, straight from founder_context
  momentum: number;          // 0-100, bounded EMA — see lib/momentum.ts
  streak: number;            // consecutive active days
  xp: number;                // lifetime XP, awarded by tasks + achievements
  executionScore: number;    // 0-100, AI-assessed reflexion quality (most recent verdict)
  tasksCompletedTotal: number;
  tasksCompletedToday: number;

  // Derived / display values — computed ONCE here, used everywhere
  projectScore: number;      // composite 0-100 used by dashboard/reports/weekly-share
  momentumLabel: { label: string; color: string; emoji: string };
  isDecaying: boolean;       // momentum dropped ≥5 pts since last check — triggers AI warning copy
  momentumDelta: number | null;   // momentum - momentum_last_week, null if no baseline yet
  momentumTrend: "up" | "down" | "flat" | "unknown"; // for UI arrows/color, e.g. Behavioral Patterns
}

const DEFAULT_SCORECARD: Omit<FounderScorecard, "projectScore" | "momentumLabel" | "isDecaying" | "momentumDelta" | "momentumTrend"> = {
  momentum: 50,
  streak: 0,
  xp: 0,
  executionScore: 0,
  tasksCompletedTotal: 0,
  tasksCompletedToday: 0,
};

/**
 * getFounderScorecard — THE function every page/route should call to read
 * scores. Single Supabase round-trip, single set of derived calculations.
 *
 * @param userId            authenticated user id
 * @param validationStrengths  optional — from project, feeds into projectScore boost
 */
export async function getFounderScorecard(
  userId: string,
  validationStrengths: string[] = [],
): Promise<FounderScorecard> {
  const admin = createAdminClient();

  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score, streak, xp, tasks_completed_total, tasks_completed_today, momentum_last_week")
    .eq("user_id", userId)
    .maybeSingle();

  // execution_score still lives on projects (per-project AI verdict, not per-founder) —
  // pull the most recently updated project's value as the representative figure.
  const { data: proj } = await admin
    .from("projects")
    .select("execution_score")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const raw = {
    momentum:             ctx?.momentum_score ?? DEFAULT_SCORECARD.momentum,
    streak:               ctx?.streak ?? DEFAULT_SCORECARD.streak,
    xp:                   ctx?.xp ?? DEFAULT_SCORECARD.xp,
    executionScore:       proj?.execution_score ?? DEFAULT_SCORECARD.executionScore,
    tasksCompletedTotal:  ctx?.tasks_completed_total ?? DEFAULT_SCORECARD.tasksCompletedTotal,
    tasksCompletedToday:  ctx?.tasks_completed_today ?? DEFAULT_SCORECARD.tasksCompletedToday,
  };

  const projectScore = computeStartupScore({
    execution_score: raw.executionScore,
    momentum_score:  raw.momentum,
    xp:              raw.xp,
    streak:          raw.streak,
    validation_strengths: validationStrengths,
  });

  const hasBaseline = typeof ctx?.momentum_last_week === "number";
  const momentumDelta = hasBaseline ? raw.momentum - (ctx!.momentum_last_week as number) : null;
  const momentumTrend: FounderScorecard["momentumTrend"] =
    momentumDelta == null ? "unknown" :
    momentumDelta >= 2    ? "up" :
    momentumDelta <= -2   ? "down" :
    "flat";

  return {
    ...raw,
    projectScore,
    momentumLabel: momentumLabel(raw.momentum),
    isDecaying: hasBaseline ? isMomentumDecaying(raw.momentum, ctx!.momentum_last_week as number) : false,
    momentumDelta,
    momentumTrend,
  };
}

/**
 * grantXP — the ONLY function permitted to increment founder_context.xp.
 * Replaces the two previously-independent writers:
 *   1. task-complete/route.ts inline `newXP = (ctx?.xp ?? 0) + xpEarned`
 *   2. lib/achievements.ts addXP() fire-and-forget client POST
 * Both call sites should now call this function (server-side; the client
 * achievements unlock flow should POST to /api/user/xp which calls this).
 *
 * Mirrors nothing onto `projects` — XP is purely a founder_context concept.
 */
export async function grantXP(userId: string, amount: number, reason: string): Promise<number> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`grantXP: amount must be a positive finite number, got ${amount}`);
  }
  const admin = createAdminClient();

  // FIX: previously read founder_context.xp in JS, computed newXP, then
  // wrote it back — two round trips with no lock between them. Two
  // near-simultaneous grants for the same user could both read the same
  // stale value and one silently overwrite the other. Now atomic —
  // see supabase/migrations/20260719000000_atomic_scorecard_rpcs.sql.
  const { data, error } = await admin.rpc("grant_xp_atomic", {
    p_user_id: userId,
    p_amount: Math.round(amount),
  });

  if (error) {
    throw new Error(`grantXP failed for user ${userId} (+${amount} for "${reason}"): ${error.message}`);
  }

  return data as number;
}

/**
 * updateStreak — the ONLY function permitted to write founder_context.streak.
 * Mirrors the result onto projects.streak (read-only mirror) for legacy
 * queries against project_summaries.
 */
export async function updateStreak(
  userId: string,
  projectId: string | null,
  todayIso: string,
): Promise<number> {
  const admin = createAdminClient();

  // FIX: previously read streak+last_checkin_date in JS, computed the new
  // value, then wrote it back — two round trips, no lock. A task-complete
  // and a concurrent reflection submit for the same user could both read
  // the same stale streak and one would silently overwrite the other's
  // increment. Now atomic — see
  // supabase/migrations/20260719000000_atomic_scorecard_rpcs.sql.
  const { data, error } = await admin.rpc("update_streak_atomic", {
    p_user_id: userId,
    p_project_id: projectId,
    p_today: todayIso,
  });

  if (error) {
    throw new Error(`updateStreak failed for user ${userId}: ${error.message}`);
  }

  return data as number;
}

/**
 * updateMomentum — the ONLY function permitted to write
 * founder_context.momentum_score. Uses the bounded EMA formula from
 * lib/momentum.ts so the value settles into a meaningful 20-100 range
 * instead of pegging to the ceiling.
 *
 * Mirrors onto projects.momentum_score (read-only mirror) for legacy reads.
 */
export async function updateMomentum(
  userId: string,
  projectId: string | null,
  signal: number,
  daysSinceLastUpdate = 1,
): Promise<number> {
  const admin = createAdminClient();

  // FIX: previously read momentum_score in JS, ran applyMomentumEMA(), then
  // wrote it back — two round trips, no lock, and a formula that had to be
  // hand-copied into supabase/functions/scheduled-jobs (Deno can't import
  // this file). Now atomic AND shared: this calls the same Postgres
  // function the edge function calls, so there's exactly one implementation
  // of the EMA math, not two to keep in sync. See
  // supabase/migrations/20260719000000_atomic_scorecard_rpcs.sql.
  const { data, error } = await admin.rpc("update_momentum_atomic", {
    p_user_id: userId,
    p_project_id: projectId,
    p_signal: signal,
    p_days_since_last_update: daysSinceLastUpdate,
  });

  if (error) {
    throw new Error(`updateMomentum failed for user ${userId}: ${error.message}`);
  }

  return data as number;
}

/**
 * setWeeklyMomentumBaseline — called once a week (Sunday cron) to snapshot
 * momentum_last_week, which powers isMomentumDecaying() comparisons.
 */
export async function setWeeklyMomentumBaseline(userId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: ctx } = await admin
    .from("founder_context")
    .select("momentum_score")
    .eq("user_id", userId)
    .maybeSingle();

  if (typeof ctx?.momentum_score === "number") {
    await admin
      .from("founder_context")
      .update({ momentum_last_week: ctx.momentum_score })
      .eq("user_id", userId);
  }
}
