/**
 * lib/server/projectReadiness.ts
 *
 * Why this file exists: lib/server/stageTransition.ts's
 * evaluateAndCacheStageTransition() already does the real work — fetch
 * milestones/reflections/overrides/evidence, resolve stageProgress, call
 * computeStageReadiness() — but it bundles that with a side effect
 * (writing founder_context.pending_stage_transition) that's only correct
 * to run at the cadence Today's automatic nudge and the "Check stage
 * readiness" button already use.
 *
 * Wiring the co-founder mascot to real readiness (see founderStanding.ts)
 * needed the SAME computation on a much higher-frequency, read-only path —
 * every pulse refresh, not every stage-check click. Copy-pasting the
 * 5-query fetch a third time would have been exactly the kind of
 * duplicate-computation problem this whole redesign started from. So the
 * fetch-and-compute half is pulled out here, side-effect-free; the two
 * real callers (evaluateAndCacheStageTransition, and the new
 * /api/founder-context/standing route) both call this, and only the
 * former still does the cache write, as its own separate step afterward.
 *
 * evaluateAndCacheStageTransition itself should be patched to call this
 * instead of running its own copy of the fetch — see the diff note in
 * stageTransition.patch.md delivered alongside this file. That patch is
 * additive-only (extracts existing code, doesn't change its behavior) and
 * is safe to apply on its own.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { STAGE_ORDER, normalizeStage } from "@/lib/stages";
import { computeStageProgress } from "@/lib/server/stageProgress";
import { computeStageReadiness } from "@/lib/server/stageReadiness";
import type { StageReadiness } from "@/lib/server/stageReadiness";
import type { StageEvidenceType } from "@/lib/server/stageEvidence";

/** Monday of the week containing `d` — copied from stageTransition.ts's
 *  private weekStart(); duplicated here rather than exported+imported
 *  because it's a 6-line pure date utility, not a computation this
 *  project has ever gotten wrong twice. If that changes, promote it to
 *  lib/dates.ts instead of a third copy. */
function weekStart(d: Date): string {
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

export interface ProjectReadinessResult {
  readiness: StageReadiness;
  currentStage: string;
  nextStage: string | null;
  /** Days since this project's most recent milestone/task touch — the
   *  same "activity" concept Projects-list's health badge already uses
   *  (project.updated_at-derived), NOT "days since last evening
   *  reflection." Those are genuinely different things (see
   *  founderStanding.ts header) and conflating them was the bug in the
   *  old CofounderPulse — it read daysSinceLastReflection and called it
   *  "days inactive," which flagged founders who were working hard but
   *  skipping the evening check-in. */
  daysInactive: number;
}

export async function getProjectReadiness(
  userId: string,
  projectId: string,
): Promise<ProjectReadinessResult | null> {
  if (!userId || !projectId) return null;
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("startup_stage, updated_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!project) return null;

  const currentStage = normalizeStage(project.startup_stage);
  const currentStageIdx = STAGE_ORDER.indexOf(currentStage);
  const nextStage = currentStageIdx < STAGE_ORDER.length - 1 ? STAGE_ORDER[currentStageIdx + 1] : null;

  const [{ data: milestones }, { data: reflections }, { count: overrideCount }, { data: evidenceRows }] =
    await Promise.all([
      supabase.from("milestones").select("id, title, status, order_index, stage").eq("project_id", projectId).eq("user_id", userId),
      supabase
        .from("reflections")
        .select("confidence, outcome")
        .eq("user_id", userId)
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("reflections")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .in("outcome", ["skipped", "overridden", "blocked"])
        .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      nextStage
        ? supabase
            .from("project_stage_evidence")
            .select("evidence_type")
            .eq("project_id", projectId)
            .eq("user_id", userId)
            .eq("from_stage", currentStage)
            .eq("to_stage", nextStage)
        : Promise.resolve({ data: [] as { evidence_type: string }[] }),
    ]);

  const stageProgress = computeStageProgress(milestones ?? [], currentStage);
  const reflectionCount = (reflections ?? []).length;
  const avgConfidence = reflectionCount > 0
    ? Math.round(((reflections ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / reflectionCount) * 10) / 10
    : null;

  const readiness = computeStageReadiness({
    stageProgress,
    nextStage,
    evidenceRows: (evidenceRows ?? []) as { evidence_type: StageEvidenceType }[],
    reflectionCount,
    avgConfidence,
    overrides: overrideCount ?? 0,
  });

  const daysInactive = project.updated_at
    ? Math.floor((Date.now() - new Date(project.updated_at).getTime()) / 86_400_000)
    : 0;

  return { readiness, currentStage, nextStage, daysInactive };
}

// weekStart is kept even though unused in this file's public surface —
// evaluateAndCacheStageTransition still needs it for the Ghost Goal pace
// check, which stays in stageTransition.ts (it's genuinely a stage-
// transition-only concern, not part of "how is this project doing").
export { weekStart };

export interface StandingLogEntry {
  readinessTier: StageReadiness["tier"];
  engagement: import("@/lib/server/founderStanding").EngagementTier;
  daysInactive: number;
  recordedAt: string;
}

/**
 * logStandingSnapshot — writes today's readiness/engagement to
 * founder_standing_log, the table this project didn't have: everything
 * built so far (readiness, engagement, momentum) was a snapshot, with no
 * record of what it was yesterday. See the migration file's header for
 * the full reasoning.
 *
 * IMPORTANT — does NOT use .upsert() with onConflict on a date
 * expression, and does NOT use a gte/lt timestamp-range query to find
 * "today's row" either. score_history tried the expression-index version
 * of this and it fails at CREATE INDEX time with Postgres error 42P17
 * (casting timestamptz to date isn't IMMUTABLE, so it can't back an
 * index) — see the migration file's header for the full story, including
 * why score_history's own index may never have existed at all. The fix
 * there was a real, plain `recorded_date` column with a plain (non-
 * expression) unique index, and this function writes to that column
 * explicitly rather than relying on its DEFAULT to agree with recorded_at.
 */
export async function logStandingSnapshot(
  userId: string,
  projectId: string,
  standing: { readiness: StageReadiness; engagement: import("@/lib/server/founderStanding").EngagementTier; daysInactive: number },
): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date();
  const recordedDate = now.toISOString().slice(0, 10); // UTC yyyy-mm-dd — matches the column's DEFAULT expression's UTC basis

  const { data: existing } = await supabase
    .from("founder_standing_log")
    .select("id")
    .eq("project_id", projectId)
    .eq("recorded_date", recordedDate)
    .maybeSingle();

  const row = {
    readiness_tier: standing.readiness.tier,
    engagement: standing.engagement,
    days_inactive: standing.daysInactive,
    recorded_at: now.toISOString(),
    recorded_date: recordedDate,
  };

  if (existing?.id) {
    await supabase.from("founder_standing_log").update(row).eq("id", existing.id);
  } else {
    await supabase.from("founder_standing_log").insert({ user_id: userId, project_id: projectId, ...row });
  }
}

/**
 * getStandingTrend — last `days` daily snapshots, oldest first, for a
 * trend row on Execution. One row per day even on days with no snapshot
 * (gaps render as gaps, not interpolated — a founder who didn't open the
 * app for 3 days should see 3 blank days, not a smoothed line pretending
 * otherwise).
 */
export async function getStandingTrend(
  projectId: string,
  days = 14,
): Promise<StandingLogEntry[]> {
  const supabase = createAdminClient();
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data } = await supabase
    .from("founder_standing_log")
    .select("readiness_tier, engagement, days_inactive, recorded_at, recorded_date")
    .eq("project_id", projectId)
    .gte("recorded_date", sinceDate)
    .order("recorded_date", { ascending: true });

  return (data ?? []).map((r) => ({
    readinessTier: r.readiness_tier as StageReadiness["tier"],
    engagement: r.engagement as import("@/lib/server/founderStanding").EngagementTier,
    daysInactive: r.days_inactive,
    recordedAt: r.recorded_at,
  }));
}
