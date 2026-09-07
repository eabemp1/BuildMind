/**
 * lib/server/founderIntelligenceExport.ts
 *
 * The honest starting point for this file: the synthesis already exists.
 * lib/founderIntelligence.ts::loadFounderIntelligence() already composes
 * founder/startup/strategy/execution/temporal state, per-archetype
 * Bayesian success stats, and a source-volume summary from 9 real tables.
 * lib/learningLoop.ts::getFounderIntelligenceAccuracy() already tracks
 * whether BuildMind's own predictions turn out right. Neither of those
 * needed rebuilding — this file does not recompute anything.
 *
 * What was actually missing: an EXPORT surface. Both of the above are
 * currently consumed by exactly one internal caller each (the Founder
 * Mirror page, AI prompt-context builders) and thrown away after
 * rendering — never persisted, never downloadable, never available for
 * the founder to look at outside the app or for cross-founder analysis
 * later. That's the gap this file closes: one function that gathers the
 * already-canonical pieces into a single report, and one route (see
 * app/api/founder-context/intelligence-export/route.ts) that lets a
 * founder actually get their own data out.
 *
 * This is explicitly NOT a new verdict, score, or synthesis of its own —
 * it doesn't decide anything or add a new number, it just packages
 * numbers that already exist and are already trusted, so the pattern
 * this whole redesign has been enforcing (one canonical source per
 * question) isn't broken by an export feature.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { loadFounderIntelligence, type FounderIntelligenceState } from "@/lib/founderIntelligence";
import { getFounderIntelligenceAccuracy, type IntelligenceAccuracy } from "@/lib/learningLoop";
import { getProjectReadiness, getStandingTrend, type StandingLogEntry } from "@/lib/server/projectReadiness";
import { getFounderStanding, type FounderStanding } from "@/lib/server/founderStanding";

export interface FounderIntelligenceReport {
  generatedAt: string;
  userId: string;
  projectId: string;
  /** Current point-in-time standing — same object Execution/mascot read. */
  standing: FounderStanding | null;
  /** Last 30 days of readiness/engagement, oldest first. */
  standingTrend: StandingLogEntry[];
  /** Rolling accuracy of BuildMind's own predictions for this founder. */
  predictionAccuracy: IntelligenceAccuracy;
  /** The full composed intelligence state — founder/startup/strategy/
   *  execution/temporal/signals/decision/archetype_stats/source_summary.
   *  See lib/founderIntelligence.ts's FounderIntelligenceState for the
   *  full shape; not flattened here so nothing about it is lost or
   *  reinterpreted in transit. */
  fullState: FounderIntelligenceState;
}

export async function buildFounderIntelligenceReport(
  userId: string,
  projectId: string,
): Promise<FounderIntelligenceReport | null> {
  if (!userId || !projectId) return null;
  const admin = createAdminClient();

  const [readinessResult, trend, accuracy, fullState] = await Promise.all([
    getProjectReadiness(userId, projectId),
    getStandingTrend(projectId, 30),
    getFounderIntelligenceAccuracy(admin, userId),
    loadFounderIntelligence(admin, userId, projectId),
  ]);

  const standing = readinessResult
    ? getFounderStanding(readinessResult.readiness, readinessResult.daysInactive)
    : null;

  // Fire-and-forget — this function's job is to hand back a report to
  // whoever asked for one; a history-logging failure shouldn't be why
  // that request fails. See logIntelligenceSnapshot()'s own header for
  // why this write is safe to attempt on every call.
  void logIntelligenceSnapshot(userId, projectId, fullState, accuracy).catch(() => {});

  return {
    generatedAt: new Date().toISOString(),
    userId,
    projectId,
    standing,
    standingTrend: trend,
    predictionAccuracy: accuracy,
    fullState,
  };
}

/**
 * logIntelligenceSnapshot — writes today's full FounderIntelligenceState
 * to founder_intelligence_log. Same idempotent-per-day pattern as
 * logStandingSnapshot() in projectReadiness.ts: explicit check-then-
 * insert-or-update against the plain `recorded_date` column, never an
 * .upsert() against a date expression (that's the exact thing that threw
 * 42P17 — see the migration file's header). Calling this multiple times
 * in one day just overwrites the same row with the latest state, which
 * is correct: the point is "what did the state look like on this day,"
 * not "log every single computation."
 */
export async function logIntelligenceSnapshot(
  userId: string,
  projectId: string,
  state: FounderIntelligenceState,
  accuracy: IntelligenceAccuracy,
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date();
  const recordedDate = now.toISOString().slice(0, 10);

  const { data: existing } = await supabase
    .from("founder_intelligence_log")
    .select("id")
    .eq("project_id", projectId)
    .eq("recorded_date", recordedDate)
    .maybeSingle();

  const row = {
    state,
    prediction_accuracy: accuracy,
    recorded_at: now.toISOString(),
    recorded_date: recordedDate,
  };

  if (existing?.id) {
    await supabase.from("founder_intelligence_log").update(row).eq("id", existing.id);
  } else {
    await supabase.from("founder_intelligence_log").insert({ user_id: userId, project_id: projectId, ...row });
  }
}

export interface IntelligenceLogEntry {
  recordedAt: string;
  state: FounderIntelligenceState;
  predictionAccuracy: IntelligenceAccuracy;
}

/**
 * getIntelligenceHistory — past daily snapshots of the full state, oldest
 * first. Unlike getStandingTrend(), this returns whole objects, not a
 * flat row shape — the caller decides what to do with 30 days of
 * archetype_stats, since there's no one obvious way to summarize that as
 * a single chart.
 */
export async function getIntelligenceHistory(
  projectId: string,
  days = 30,
): Promise<IntelligenceLogEntry[]> {
  const supabase = createAdminClient();
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("founder_intelligence_log")
    .select("recorded_at, state, prediction_accuracy")
    .eq("project_id", projectId)
    .gte("recorded_date", sinceDate)
    .order("recorded_date", { ascending: true });

  return (data ?? []).map((r) => ({
    recordedAt: r.recorded_at,
    state: r.state as FounderIntelligenceState,
    predictionAccuracy: r.prediction_accuracy as IntelligenceAccuracy,
  }));
}

/**
 * toCSV — flattens only the genuinely time-series part (standingTrend)
 * into rows. The rest of the report (fullState, current standing,
 * accuracy) is a snapshot, not a series, and doesn't have a natural row
 * shape — those stay in the JSON export. A spreadsheet is the right tool
 * for "how did readiness/engagement move over 30 days," not for a nested
 * state object with per-archetype Bayesian stats.
 */
export function standingTrendToCSV(trend: StandingLogEntry[]): string {
  const header = "date,readiness_tier,engagement,days_inactive";
  const rows = trend.map((r) =>
    [r.recordedAt.slice(0, 10), r.readinessTier, r.engagement, r.daysInactive].join(",")
  );
  return [header, ...rows].join("\n");
}
