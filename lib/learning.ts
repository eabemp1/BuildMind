/**
 * lib/learning.ts — Behavioral Learning Loop
 *
 * This module closes the feedback memory gap by:
 *   1. Reading the reflexion_learning_log for a user
 *   2. Deriving behavioral patterns (what they complete, avoid, override)
 *   3. Returning a LearnedPatterns object that gets injected into the
 *      Reflexion pipeline's Generator and Refiner prompts
 *
 * Also exports:
 *   writeLearnedPatterns()  — persists derived patterns to founder_context
 *   recordActionShown()     — writes a new pending log row after analysis
 *   recordActionOutcome()   — updates outcome when founder responds
 *   inferActionType()       — categorises action text into a type label
 *   inferActionPlatform()   — extracts platform from action text
 *
 * SERVER-SIDE ONLY. Import only from API routes.
 *
 * How the loop works:
 *   [break-my-startup runs]
 *     → recordActionShown() writes pending row
 *     → learnedPatterns injected into pipeline BEFORE generation
 *   [founder completes or overrides]
 *     → recordActionOutcome() updates outcome
 *     → deriveLearnedPatterns() re-derives patterns
 *     → writeLearnedPatterns() persists to founder_context.learned_patterns
 *   [next analysis run]
 *     → getLearnedPatterns() reads persisted patterns (fast, no re-derivation)
 *     → injected into Generator + Refiner prompts
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import { inferActionType, inferActionPlatform, type ActionType, type ActionPlatform } from "@/lib/actionClassification";

// Re-exported for backward compatibility — these used to be defined here.
// Moved to lib/actionClassification.ts (dependency-free) so client code
// (lib/founderMemory.ts) can use the same classification without pulling
// this server-only module (createAdminClient) into the browser bundle.
export { inferActionType, inferActionPlatform };
export type { ActionType, ActionPlatform };

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActionOutcome =
  | "completed"
  | "overridden"
  | "ignored"
  | "partial"
  | "pending";

/**
 * LearnedPatterns — the behavioral summary injected into the pipeline.
 * Derived from the last 20 log rows for this user.
 */
export interface LearnedPatterns {
  // Action types this founder consistently completes
  preferred_action_types: ActionType[];
  // Action types this founder consistently avoids or overrides
  avoided_action_types: ActionType[];
  // Platforms this founder has overridden or ignored repeatedly
  avoided_platforms: ActionPlatform[];
  // Reasons given when overriding (from outcome_note field)
  override_reasons: string[];
  // Pivot angles already tried (avoid repeating them)
  pivot_angles_tried: string[];
  // Completion rate: 0–1 (completed / total resolved)
  completion_rate: number;
  // Total rows used to derive this (0 = no history yet)
  total_logged: number;
  // Whether we have enough data to be confident in the patterns
  patterns_reliable: boolean;  // true when total_logged >= 5
  /**
   * weak_quality_action_types — action types where the pipeline
   * consistently produces low Verifier confidence (< 0.5) OR low
   * viability scores (< 40), regardless of founder outcome. These
   * categories need stronger Agent A signals, not just avoidance.
   */
  weak_quality_action_types: ActionType[];
  /**
   * avg_verifier_confidence — mean Verifier Agent confidence across all
   * rows with a recorded verifier score. If this trends below 0.5,
   * the whole pipeline is generating weak analyses, not just rejected
   * ones — the problem is upstream of the founder's choices.
   */
  avg_verifier_confidence: number | null;
}

export interface LearningLogRow {
  id: string;
  user_id: string;
  project_id?: string | null;
  session_id: string;
  stage: string;
  action_shown: string;
  action_type?: ActionType | null;
  action_platform?: ActionPlatform | null;
  critic_persona?: string | null;
  viability_score?: number | null;
  confidence?: number | null;
  /**
   * verifier_confidence — the Verifier Agent's (Agent D) confidence_score
   * for this run (0–1). Low values mean the Verifier found weak reasoning
   * or missing data. Used to detect categories where the pipeline
   * consistently produces low-quality outputs, not just ones the founder
   * ignores.
   */
  verifier_confidence?: number | null;
  /**
   * rebuttal_score — viability_score at the time the action was shown.
   * Stored separately so deriveLearnedPatterns can track whether whole
   * categories of actions arrive with structurally weak viability, which
   * signals the Generator is mis-calibrated for that type, not that the
   * founder is hard to please.
   */
  rebuttal_score?: number | null;
  pivot_angle?: string | null;
  pivot_title?: string | null;
  outcome: ActionOutcome;
  outcome_note?: string | null;
  outcome_recorded_at?: string | null;
  created_at: string;
}

// ─── Action classification ────────────────────────────────────────────────────
// inferActionType / inferActionPlatform now live in lib/actionClassification.ts
// (re-exported above) — see that file for implementation.

// ─── Pattern derivation ───────────────────────────────────────────────────────

/**
 * deriveLearnedPatterns — reads the last 20 log rows for a user and computes
 * the LearnedPatterns object. The core of the learning loop.
 */
export function deriveLearnedPatterns(rows: LearningLogRow[]): LearnedPatterns {
  const empty: LearnedPatterns = {
    preferred_action_types: [],
    avoided_action_types: [],
    avoided_platforms: [],
    override_reasons: [],
    pivot_angles_tried: [],
    completion_rate: 0,
    total_logged: 0,
    patterns_reliable: false,
    weak_quality_action_types: [],
    avg_verifier_confidence: null,
  };

  if (!rows || rows.length === 0) return empty;

  // Only count resolved rows for rate calculation
  const resolved = rows.filter(r =>
    r.outcome === "completed" || r.outcome === "overridden" ||
    r.outcome === "ignored" || r.outcome === "partial"
  );

  const completed = resolved.filter(r => r.outcome === "completed" || r.outcome === "partial");
  const failed = resolved.filter(r => r.outcome === "overridden" || r.outcome === "ignored");

  const completion_rate = resolved.length > 0
    ? Math.round((completed.length / resolved.length) * 100) / 100
    : 0;

  // Count action type frequencies
  const completedTypeCounts = new Map<ActionType, number>();
  const failedTypeCounts = new Map<ActionType, number>();

  for (const row of completed) {
    if (row.action_type) {
      completedTypeCounts.set(row.action_type, (completedTypeCounts.get(row.action_type) ?? 0) + 1);
    }
  }
  for (const row of failed) {
    if (row.action_type) {
      failedTypeCounts.set(row.action_type, (failedTypeCounts.get(row.action_type) ?? 0) + 1);
    }
  }

  // Preferred: completed at least twice, more completions than failures
  const preferred_action_types = Array.from(completedTypeCounts.entries())
    .filter(([type, count]) => count >= 2 && count > (failedTypeCounts.get(type) ?? 0))
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)
    .slice(0, 3) as ActionType[];

  // Avoided: failed at least twice, more failures than completions
  const avoided_action_types = Array.from(failedTypeCounts.entries())
    .filter(([type, count]) => count >= 2 && count > (completedTypeCounts.get(type) ?? 0))
    .sort((a, b) => b[1] - a[1])
    .map(([type]) => type)
    .slice(0, 3) as ActionType[];

  // Avoided platforms: platforms where outcome was overridden/ignored ≥ 2 times
  const platformFailCounts = new Map<ActionPlatform, number>();
  for (const row of failed) {
    if (row.action_platform) {
      platformFailCounts.set(row.action_platform, (platformFailCounts.get(row.action_platform) ?? 0) + 1);
    }
  }
  const avoided_platforms = Array.from(platformFailCounts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([platform]) => platform)
    .slice(0, 3) as ActionPlatform[];

  // Override reasons: non-empty outcome_notes from overridden rows
  const override_reasons = rows
    .filter(r => r.outcome === "overridden" && r.outcome_note)
    .map(r => r.outcome_note!)
    .filter(Boolean)
    .slice(0, 5);

  // Pivot angles tried: collect all pivot_angle values to avoid repetition
  const pivot_angles_tried = rows
    .filter(r => r.pivot_angle)
    .map(r => r.pivot_angle!)
    .filter(Boolean)
    .filter((v, i, arr) => arr.indexOf(v) === i) // deduplicate
    .slice(0, 5);

  // ── Quality degradation signals ───────────────────────────────────────────
  // These track pipeline output quality independently of founder behaviour.
  // A category that the founder never ignores can still be producing weak
  // analyses — that needs a different fix (better signals to Agent A) than
  // simply telling the Generator to avoid that category.

  // Per-type quality tracking: accumulate verifier confidence and viability
  const typeVerifierScores = new Map<ActionType, number[]>();
  const typeViabilityScores = new Map<ActionType, number[]>();

  for (const row of rows) {
    if (!row.action_type) continue;
    if (row.verifier_confidence != null) {
      const existing = typeVerifierScores.get(row.action_type) ?? [];
      existing.push(row.verifier_confidence);
      typeVerifierScores.set(row.action_type, existing);
    }
    const viability = row.rebuttal_score ?? row.viability_score;
    if (viability != null) {
      const existing = typeViabilityScores.get(row.action_type) ?? [];
      existing.push(viability);
      typeViabilityScores.set(row.action_type, existing);
    }
  }

  // Weak quality: action types where avg verifier confidence < 0.5 OR
  // avg viability < 40, with at least 2 data points.
  const weak_quality_action_types = Array.from(
    new Set([...typeVerifierScores.keys(), ...typeViabilityScores.keys()])
  ).filter((type) => {
    const verScores = typeVerifierScores.get(type) ?? [];
    const viabScores = typeViabilityScores.get(type) ?? [];
    const hasEnoughData = (verScores.length + viabScores.length) >= 2;
    if (!hasEnoughData) return false;
    const avgVer = verScores.length > 0
      ? verScores.reduce((a, b) => a + b, 0) / verScores.length
      : null;
    const avgViab = viabScores.length > 0
      ? viabScores.reduce((a, b) => a + b, 0) / viabScores.length
      : null;
    return (avgVer != null && avgVer < 0.5) || (avgViab != null && avgViab < 40);
  }).slice(0, 3) as ActionType[];

  // Overall average verifier confidence across all rows that have it
  const allVerifierScores = rows
    .map(r => r.verifier_confidence)
    .filter((v): v is number => v != null);
  const avg_verifier_confidence = allVerifierScores.length > 0
    ? Math.round((allVerifierScores.reduce((a, b) => a + b, 0) / allVerifierScores.length) * 100) / 100
    : null;

  return {
    preferred_action_types,
    avoided_action_types,
    avoided_platforms,
    override_reasons,
    pivot_angles_tried,
    completion_rate,
    total_logged: rows.length,
    patterns_reliable: rows.length >= 5,
    weak_quality_action_types,
    avg_verifier_confidence,
  };
}

/**
 * buildLearnedPatternsPrompt — converts LearnedPatterns into a prompt
 * injection string for the Generator and Refiner agents.
 *
 * Returns empty string if patterns are not yet reliable (< 5 rows).
 * This prevents the AI from over-fitting to noise in early runs.
 *
 * Includes two classes of signal:
 *   1. Founder behaviour (avoidance, completion, override reasons) — was
 *      already here. Tells the Generator what the founder does.
 *   2. Pipeline quality (verifier confidence, weak action types) — NEW.
 *      Tells the Generator where ITS OWN outputs have been structurally
 *      weak, regardless of what the founder chose to do.
 */
export function buildLearnedPatternsPrompt(patterns: LearnedPatterns): string {
  if (!patterns.patterns_reliable) return "";

  const lines: string[] = ["LEARNED FOUNDER BEHAVIOR (from past analysis runs):"];
  const preferredActionTypes = patterns.preferred_action_types ?? [];
  const avoidedActionTypes = patterns.avoided_action_types ?? [];
  const avoidedPlatforms = patterns.avoided_platforms ?? [];
  const overrideReasons = patterns.override_reasons ?? [];
  const pivotAnglesTried = patterns.pivot_angles_tried ?? [];
  const weakQualityActionTypes = patterns.weak_quality_action_types ?? [];

  if (preferredActionTypes.length > 0) {
    lines.push(
      `- This founder COMPLETES actions of type: ${preferredActionTypes.join(", ")}. Prioritise these.`
    );
  }

  if (avoidedActionTypes.length > 0) {
    lines.push(
      `- This founder AVOIDS or OVERRIDES actions of type: ${avoidedActionTypes.join(", ")}. Do NOT recommend these unless unavoidable.`
    );
  }

  if (avoidedPlatforms.length > 0) {
    lines.push(
      `- This founder has repeatedly ignored or rejected actions on: ${avoidedPlatforms.join(", ")}. Suggest alternative platforms.`
    );
  }

  if (overrideReasons.length > 0) {
    lines.push(
      `- When they override, they say: "${overrideReasons.slice(0, 2).join('" / "')}". Address these objections proactively.`
    );
  }

  if (pivotAnglesTried.length > 0) {
    lines.push(
      `- Pivot angles already shown (do NOT repeat): ${pivotAnglesTried.join(", ")}.`
    );
  }

  lines.push(
    `- Completion rate so far: ${Math.round(patterns.completion_rate * 100)}% (${patterns.total_logged} actions logged).`
  );

  if (patterns.completion_rate < 0.4) {
    lines.push(
      `- IMPORTANT: Low completion rate. Make the next action SMALLER and MORE SPECIFIC than usual. Reduce cognitive friction.`
    );
  } else if (patterns.completion_rate > 0.75) {
    lines.push(
      `- IMPORTANT: High completion rate. This founder executes well. You can give them a harder, higher-leverage task.`
    );
  }

  // ── Pipeline quality signals (NEW) ────────────────────────────────────────
  // These are about the quality of YOUR previous outputs, not the founder's
  // behaviour. Low verifier confidence means the Verifier Agent found weak
  // reasoning — you need stronger market signals before recommending in
  // those categories.

  if (weakQualityActionTypes.length > 0) {
    lines.push(
      `- PIPELINE QUALITY WARNING: Your past outputs for action types [${weakQualityActionTypes.join(", ")}] had consistently low Verifier confidence or viability scores. Before recommending actions in these categories, ensure you have stronger demand signals, specific competitor data, or a concrete validation mechanism. Do not generate actions in these categories without explicit evidence.`
    );
  }

  if (patterns.avg_verifier_confidence != null && patterns.avg_verifier_confidence < 0.5) {
    lines.push(
      `- PIPELINE QUALITY WARNING: Average Verifier confidence across all past runs is ${Math.round(patterns.avg_verifier_confidence * 100)}% — below the 50% threshold. This means your analyses have been arriving with weak evidence overall. Prioritise specificity: name actual platforms, cite concrete signals, and avoid generic recommendations. Quality over novelty.`
    );
  }

  return lines.join("\n");
}

// ─── Database operations ──────────────────────────────────────────────────────

/**
 * getLearnedPatterns — reads persisted patterns from founder_context.
 * Fast path: returns cached patterns without re-querying the log.
 * Falls back to deriving fresh if cache is empty.
 */
export async function getLearnedPatterns(userId: string): Promise<LearnedPatterns> {
  const empty: LearnedPatterns = {
    preferred_action_types: [],
    avoided_action_types: [],
    avoided_platforms: [],
    override_reasons: [],
    pivot_angles_tried: [],
    completion_rate: 0,
    total_logged: 0,
    patterns_reliable: false,
    weak_quality_action_types: [],
    avg_verifier_confidence: null,
  };

  try {
    const supabase = createAdminClient();

    // Try fast path: read cached patterns from founder_context
    const { data: ctx } = await supabase
      .from("founder_context")
      .select("learned_patterns")
      .eq("user_id", userId)
      .maybeSingle();

    if (ctx?.learned_patterns && (ctx.learned_patterns as LearnedPatterns).total_logged > 0) {
      return ctx.learned_patterns as LearnedPatterns;
    }

    // Slow path: derive from log (first time, or cache miss)
    return await deriveAndCachePatterns(userId);
  } catch (err) {
    logError("learning/getLearnedPatterns", err);
    return empty;
  }
}

/**
 * deriveAndCachePatterns — reads the log, derives patterns, writes back to
 * founder_context.learned_patterns. Called when cache is stale or missing.
 */
export async function deriveAndCachePatterns(userId: string): Promise<LearnedPatterns> {
  const empty: LearnedPatterns = {
    preferred_action_types: [],
    avoided_action_types: [],
    avoided_platforms: [],
    override_reasons: [],
    pivot_angles_tried: [],
    completion_rate: 0,
    total_logged: 0,
    patterns_reliable: false,
    weak_quality_action_types: [],
    avg_verifier_confidence: null,
  };

  try {
    const supabase = createAdminClient();

    const { data: rows, error } = await supabase
      .from("reflexion_learning_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !rows) return empty;

    const patterns = deriveLearnedPatterns(rows as LearningLogRow[]);

    // Write back to cache (fire-and-forget)
    void Promise.resolve(
      supabase
        .from("founder_context")
        .update({ learned_patterns: patterns })
        .eq("user_id", userId)
        .then(() => {}),
    ).catch((err) => logError("learning/cachePatterns", err));

    return patterns;
  } catch (err) {
    logError("learning/deriveAndCachePatterns", err);
    return empty;
  }
}

/**
 * recordActionShown — writes a new pending log row when an action is shown.
 * Called from break-my-startup/route.ts after the pipeline completes.
 * Returns the new row id (used later to record the outcome).
 */
export async function recordActionShown(params: {
  userId: string;
  projectId?: string;
  sessionId: string;
  stage: string;
  actionShown: string;
  criticPersona?: string;
  viabilityScore?: number;
  confidence?: number;
  /** verifierConfidence — Verifier Agent (Agent D) confidence_score (0–1). */
  verifierConfidence?: number;
  pivotAngle?: string;
  pivotTitle?: string;
}): Promise<string | null> {
  try {
    const supabase = createAdminClient();

    const actionType = inferActionType(params.actionShown);
    const actionPlatform = inferActionPlatform(params.actionShown);

    const { data, error } = await supabase
      .from("reflexion_learning_log")
      .insert({
        user_id: params.userId,
        project_id: params.projectId ?? null,
        session_id: params.sessionId,
        stage: params.stage,
        action_shown: params.actionShown,
        action_type: actionType,
        action_platform: actionPlatform,
        critic_persona: params.criticPersona ?? null,
        viability_score: params.viabilityScore ?? null,
        confidence: params.confidence ?? null,
        recommendation_shown_at: new Date().toISOString(),
        lifecycle_events: [{ type: "shown", at: new Date().toISOString() }],
        verifier_confidence: params.verifierConfidence ?? null,
        // rebuttal_score mirrors viability_score at show-time so
        // deriveLearnedPatterns can use it without ambiguity
        rebuttal_score: params.viabilityScore ?? null,
        pivot_angle: params.pivotAngle ?? null,
        pivot_title: params.pivotTitle ?? null,
        outcome: "pending",
      })
      .select("id")
      .maybeSingle();

    if (error || !data) return null;
    return data.id as string;
  } catch (err) {
    logError("learning/recordActionShown", err);
    return null;
  }
}

/**
 * recordActionOutcome — updates the outcome of a log row.
 * Called from /api/ai/reflexion-outcome route when founder responds.
 * After updating, re-derives and caches patterns.
 */
export async function recordActionOutcome(params: {
  logRowId: string;
  userId: string;
  outcome: ActionOutcome;
  outcomeNote?: string;
}): Promise<boolean> {
  try {
    const supabase = createAdminClient();

    const { error } = await supabase
      .from("reflexion_learning_log")
      .update({
        outcome: params.outcome,
        outcome_note: params.outcomeNote ?? null,
        outcome_recorded_at: new Date().toISOString(),
      })
      .eq("id", params.logRowId)
      .eq("user_id", params.userId); // RLS double-check

    if (error) return false;

    // Re-derive and cache patterns after outcome recorded (fire-and-forget)
    deriveAndCachePatterns(params.userId)
      .then(() => {})
      .catch((err) => logError("learning/deriveAndCachePatterns", err));

    return true;
  } catch (err) {
    logError("learning/recordActionOutcome", err);
    return false;
  }
}

/**
 * markIgnoredAfter24h — batch job helper.
 * Marks all pending rows older than 24h as "ignored".
 * Call this from a scheduled job or lazily on each analysis run.
 * Safe to call multiple times (idempotent).
 */
export async function markIgnoredAfter24h(userId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    await supabase
      .from("reflexion_learning_log")
      .update({
        outcome: "ignored",
        outcome_recorded_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("outcome", "pending")
      .lt("created_at", cutoff);
  } catch (err) { logError("learning/markIgnoredAfter24h", err); /* non-fatal */ }
}
