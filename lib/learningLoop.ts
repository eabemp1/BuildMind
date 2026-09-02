/**
 * lib/learningLoop.ts — Phase 11: The Founder Intelligence Learning Loop
 *
 *   PREDICT  → recordFounderIntelligencePrediction()
 *   ACT      → (founder acts in the product; nothing to do here)
 *   OBSERVE  → the founder reports what happened (task-complete / reflection)
 *   COMPARE  → compareFounderIntelligenceOutcome()
 *   LEARN    → updateIntelligenceAccuracy() (called internally by COMPARE)
 *
 * This closes the loop described in the Founder Intelligence OS spec:
 * BuildMind should visibly get more accurate over time. It does this by
 * recording the deterministic top DecisionCandidate (lib/founderIntelligence.ts)
 * as a prediction, then scoring how closely the founder's actual outcome
 * matched the predicted expected_evidence.
 *
 * Reuses reflexion_learning_log (see 20260605000000_founder_intelligence_learning_loop.sql)
 * instead of a parallel predictions table. Every call is designed to be safe
 * to call fire-and-forget from API routes: it never throws, and failures are
 * logged, not propagated, matching the existing pattern in lib/learning.ts.
 *
 * SERVER-SIDE ONLY.
 */

import { logError } from "@/lib/server/logger";
import type { DecisionCandidate, IntelligenceSignalType } from "@/lib/founderIntelligence";

type SupabaseLike = { from: (table: string) => any };

export interface IntelligenceAccuracy {
  sample_size: number;
  average_match_score: number; // 0-1
  last_updated_at: string | null;
  trend: "up" | "down" | "flat" | "unknown";
}

const DEFAULT_ACCURACY: IntelligenceAccuracy = {
  sample_size: 0,
  average_match_score: 0,
  last_updated_at: null,
  trend: "unknown",
};

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function keywordOverlapScore(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits++;
  return Math.min(1, hits / Math.min(wa.size, wb.size, 6));
}

/**
 * PREDICT — writes a pending reflexion_learning_log row for the deterministic
 * top candidate. Called right after lib/founderIntelligence.ts computes the
 * decision state (see app/api/ai/today-action/route.ts).
 */
export async function recordFounderIntelligencePrediction(
  supabase: SupabaseLike,
  params: {
    userId: string;
    projectId?: string | null;
    stage: string;
    sessionId: string;
    candidate: DecisionCandidate;
    supportingSignals?: IntelligenceSignalType[];
    alternatives?: DecisionCandidate[];
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("reflexion_learning_log")
      .insert({
        user_id: params.userId,
        project_id: params.projectId || null,
        session_id: params.sessionId,
        stage: params.stage || "Idea",
        action_shown: params.candidate.action,
        prediction_source: "founder_intelligence",
        candidate_id: params.candidate.id,
        predicted_evidence: params.candidate.expected_evidence,
        supporting_signals: params.supportingSignals ?? params.candidate.supporting_signals ?? [],
        prediction_confidence: Math.max(0, Math.min(1, (params.candidate.scores?.confidence ?? 50) / 100)),
        decision_rationale: {
          rationale: params.candidate.rationale,
          why_it_beats_alternatives: params.candidate.why_it_beats_alternatives,
          scores: params.candidate.scores,
          supporting_signals: params.supportingSignals ?? params.candidate.supporting_signals ?? [],
        },
        alternatives_considered: (params.alternatives ?? []).map((alternative) => ({
          id: alternative.id,
          action: alternative.action,
          rationale: alternative.rationale,
          score: alternative.scores.total,
          expected_evidence: alternative.expected_evidence,
        })),
        decision_confidence: Math.max(0, Math.min(1, (params.candidate.scores?.confidence ?? 50) / 100)),
        review_condition: params.candidate.expected_evidence,
        decision_recorded_at: new Date().toISOString(),
        outcome: "pending",
      })
      .select("id")
      .single();

    if (error) throw error;
    return data?.id ?? null;
  } catch (err) {
    logError("learningLoop/recordFounderIntelligencePrediction", err, { userId: params.userId });
    return null;
  }
}

/**
 * Called when a founder taps an alternative on the Today card instead of
 * the deterministic top candidate. Updates the still-pending prediction row
 * to point at the chosen archetype instead of creating a second row —
 * there should be exactly one pending Founder Intelligence prediction per
 * shown action, and it needs to describe what the founder is actually about
 * to do, or reflect-action's later outcome comparison and Thompson
 * Sampling's per-archetype stats would both be scored against the wrong
 * candidate.
 */
export async function swapPredictionCandidate(
  supabase: SupabaseLike,
  params: { userId: string; recommendationId?: string | null; candidate: DecisionCandidate },
): Promise<boolean> {
  try {
    if (!params.recommendationId) return false;

    const { error: updateErr } = await supabase
      .from("reflexion_learning_log")
      .update({
        action_shown: params.candidate.action,
        candidate_id: params.candidate.id,
        predicted_evidence: params.candidate.expected_evidence,
        decision_rationale: {
          rationale: params.candidate.rationale,
          why_it_beats_alternatives: params.candidate.why_it_beats_alternatives,
          scores: params.candidate.scores,
          founder_swapped: true,
        },
        review_condition: params.candidate.expected_evidence,
      })
      .eq("id", params.recommendationId)
      .eq("user_id", params.userId)
      .eq("prediction_source", "founder_intelligence")
      .eq("outcome", "pending");
    if (updateErr) throw updateErr;
    return true;
  } catch (err) {
    logError("learningLoop/swapPredictionCandidate", err, { userId: params.userId });
    return false;
  }
}

export interface ResolvedPrediction {
  action_shown: string;
  outcome: string;
  outcome_note: string | null;
  evidence_match_score: number | null;
  outcome_recorded_at: string | null;
}

/**
 * Last few resolved (non-pending) Founder Intelligence predictions, most
 * recent first. This is what powers the "what happened last time" view —
 * the actual compounding evidence loop, not just a streak counter. Without
 * this visible somewhere, the whole learning-loop rebuild this session is
 * invisible to the one person it's meant to build trust with.
 */
export async function getRecentResolvedPredictions(supabase: SupabaseLike, userId: string, limit = 3): Promise<ResolvedPrediction[]> {
  try {
    const { data, error } = await supabase
      .from("reflexion_learning_log")
      .select("action_shown, outcome, outcome_note, evidence_match_score, outcome_recorded_at")
      .eq("user_id", userId)
      .eq("prediction_source", "founder_intelligence")
      .neq("outcome", "pending")
      .order("outcome_recorded_at", { ascending: false, nullsFirst: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as ResolvedPrediction[];
  } catch (err) {
    logError("learningLoop/getRecentResolvedPredictions", err, { userId });
    return [];
  }
}

function mapOutcome(raw: string): "completed" | "overridden" | "ignored" | "partial" {
  const o = raw.toLowerCase();
  if (o === "completed" || o === "done") return "completed";
  if (o === "blocked" || o === "abandoned") return "partial";
  if (o === "skipped") return "overridden";
  return "partial";
}

/**
 * COMPARE + LEARN — finds the founder's most recent pending Founder
 * Intelligence prediction, scores the observed outcome against the
 * predicted expected_evidence, and updates the rolling accuracy cached on
 * founder_context. Called from task-complete / reflection routes.
 *
 * Deterministic by design (Phase 13: no LLM needed for this comparison).
 */
export async function compareFounderIntelligenceOutcome(
  supabase: SupabaseLike,
  params: {
    userId: string;
    /** Explicit lifecycle identity; legacy outcomes are not attributed. */
    recommendationId?: string | null;
    taskTitle: string;
    outcome: string;
    reflectionText?: string;
    /** Server-created evidence rows, never browser-supplied references. */
    evidenceReferences?: Array<{ source: "reflection" | "task" | "activity"; recordId: string }>;
  },
): Promise<{ matched: boolean; score: number } | null> {
  try {
    // Legacy outcomes have no durable recommendation identity. Do not guess
    // with "latest pending": a late reflection or concurrent recommendation
    // can otherwise train the wrong candidate.
    if (!params.recommendationId || !params.reflectionText?.trim()) return null;
    const { data: pending, error: findError } = await supabase
      .from("reflexion_learning_log")
      .select("id, predicted_evidence, action_shown, created_at")
      .eq("id", params.recommendationId)
      .eq("user_id", params.userId)
      .eq("prediction_source", "founder_intelligence")
      .eq("outcome", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (!pending) return null;

    const observedText = `${params.taskTitle} ${params.reflectionText}`.trim();
    const actionOverlap = keywordOverlapScore(String(pending.action_shown ?? ""), observedText);
    const evidenceOverlap = keywordOverlapScore(String(pending.predicted_evidence ?? ""), observedText);
    const completed = mapOutcome(params.outcome) === "completed";
    // A server-created evidence reference confirms an actual durable outcome
    // row exists. It improves evidence quality but does not itself claim the
    // predicted evidence occurred; textual comparison remains the fallback
    // for semantic match until structured expected-evidence fields exist.
    const hasStructuredEvidence = Boolean(params.evidenceReferences?.length);
    const score = Math.max(0, Math.min(1, actionOverlap * 0.35 + evidenceOverlap * 0.45 + (completed ? 0.1 : 0) + (hasStructuredEvidence ? 0.1 : 0)));

    const { error: updateError } = await supabase
      .from("reflexion_learning_log")
      .update({
        outcome: mapOutcome(params.outcome),
        outcome_recorded_at: new Date().toISOString(),
        evidence_match_score: score,
        outcome_note: params.reflectionText?.trim() ? params.reflectionText.trim().slice(0, 200) : null,
      })
      .eq("id", pending.id);

    if (updateError) throw updateError;

    await updateIntelligenceAccuracy(supabase, params.userId);

    return { matched: score >= 0.5, score };
  } catch (err) {
    logError("learningLoop/compareFounderIntelligenceOutcome", err, { userId: params.userId });
    return null;
  }
}

/**
 * LEARN — recomputes the rolling accuracy from the last 20 resolved
 * founder_intelligence predictions and caches it on founder_context so
 * FounderState.confidence and the Founder Mirror can read it cheaply.
 */
export async function updateIntelligenceAccuracy(supabase: SupabaseLike, userId: string): Promise<IntelligenceAccuracy> {
  try {
    const { data: rows, error } = await supabase
      .from("reflexion_learning_log")
      .select("evidence_match_score, outcome_recorded_at")
      .eq("user_id", userId)
      .eq("prediction_source", "founder_intelligence")
      .not("evidence_match_score", "is", null)
      .order("outcome_recorded_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    const scores: number[] = (rows ?? []).map((r: any) => Number(r.evidence_match_score)).filter((n: number) => Number.isFinite(n));
    if (!scores.length) return DEFAULT_ACCURACY;

    const recent = scores.slice(0, 5);
    const older = scores.slice(5, 10);
    const avg = (arr: number[]) => arr.reduce((s, n) => s + n, 0) / arr.length;
    const average_match_score = Math.round(avg(scores) * 1000) / 1000;
    let trend: IntelligenceAccuracy["trend"] = "unknown";
    if (older.length >= 3) {
      const recentAvg = avg(recent);
      const olderAvg = avg(older);
      trend = recentAvg > olderAvg + 0.05 ? "up" : recentAvg < olderAvg - 0.05 ? "down" : "flat";
    }

    const accuracy: IntelligenceAccuracy = {
      sample_size: scores.length,
      average_match_score,
      last_updated_at: new Date().toISOString(),
      trend,
    };

    await supabase.from("founder_context").update({ intelligence_accuracy: accuracy }).eq("user_id", userId);
    return accuracy;
  } catch (err) {
    logError("learningLoop/updateIntelligenceAccuracy", err, { userId });
    return DEFAULT_ACCURACY;
  }
}

/** Reads the cached rolling accuracy without recomputing it. */
export async function getFounderIntelligenceAccuracy(supabase: SupabaseLike, userId: string): Promise<IntelligenceAccuracy> {
  try {
    const { data, error } = await supabase.from("founder_context").select("intelligence_accuracy").eq("user_id", userId).maybeSingle();
    if (error) throw error;
    const cached = data?.intelligence_accuracy;
    if (!cached || typeof cached !== "object") return DEFAULT_ACCURACY;
    return { ...DEFAULT_ACCURACY, ...cached };
  } catch (err) {
    logError("learningLoop/getFounderIntelligenceAccuracy", err, { userId });
    return DEFAULT_ACCURACY;
  }
}

export interface ArchetypeStats {
  [candidateId: string]: { successes: number; failures: number };
}

/**
 * Aggregates resolved (non-pending) founder_intelligence predictions by
 * candidate_id (FI OS archetype: evidence_probe / unstall_goal /
 * avoidance_microdose / continue_best_next_task) for one founder.
 *
 * This is what turns the learning loop from "a number on a dashboard" into
 * an actual input to future decisions: lib/founderIntelligence.ts's
 * scoreCandidate() samples from a Beta(successes+1, failures+1) posterior
 * per archetype (Thompson Sampling) using exactly these counts, so an
 * archetype that's reliably produced real evidence for this specific
 * founder gets ranked higher over time, and one that hasn't gets tried less
 * — without any hand-tuned per-founder weights.
 *
 * A row counts as a success if outcome === "completed" AND
 * evidence_match_score >= 0.5 (the same bar compareFounderIntelligenceOutcome
 * uses to decide "matched" — kept identical on purpose so this function and
 * the dashboard accuracy number can never quietly disagree about what
 * counts as a hit).
 */
export async function getCandidateArchetypeStats(supabase: SupabaseLike, userId: string): Promise<ArchetypeStats> {
  try {
    const { data, error } = await supabase
      .from("reflexion_learning_log")
      .select("candidate_id, outcome, evidence_match_score")
      .eq("user_id", userId)
      .eq("prediction_source", "founder_intelligence")
      .neq("outcome", "pending")
      .not("candidate_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;
    const stats: ArchetypeStats = {};
    for (const row of (data ?? []) as Array<{ candidate_id: string | null; outcome: string; evidence_match_score: number | null }>) {
      const id = row.candidate_id;
      if (!id) continue;
      if (!stats[id]) stats[id] = { successes: 0, failures: 0 };
      const success = row.outcome === "completed" && (row.evidence_match_score ?? 0) >= 0.5;
      if (success) stats[id].successes += 1;
      else stats[id].failures += 1;
    }
    return stats;
  } catch (err) {
    logError("learningLoop/getCandidateArchetypeStats", err, { userId });
    return {};
  }
          }
