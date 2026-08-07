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
    taskTitle: string;
    outcome: string;
    reflectionText?: string;
  },
): Promise<{ matched: boolean; score: number } | null> {
  try {
    const { data: pending, error: findError } = await supabase
      .from("reflexion_learning_log")
      .select("id, predicted_evidence, action_shown, created_at")
      .eq("user_id", params.userId)
      .eq("prediction_source", "founder_intelligence")
      .eq("outcome", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (findError) throw findError;
    if (!pending) return null;

    const observedText = `${params.taskTitle} ${params.reflectionText ?? ""}`.trim();
    const actionOverlap = keywordOverlapScore(String(pending.action_shown ?? ""), observedText);
    const evidenceOverlap = keywordOverlapScore(String(pending.predicted_evidence ?? ""), observedText);
    const completed = mapOutcome(params.outcome) === "completed";
    const score = Math.max(0, Math.min(1, actionOverlap * 0.4 + evidenceOverlap * 0.4 + (completed ? 0.2 : 0)));

    const { error: updateError } = await supabase
      .from("reflexion_learning_log")
      .update({
        outcome: mapOutcome(params.outcome),
        outcome_recorded_at: new Date().toISOString(),
        evidence_match_score: score,
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
