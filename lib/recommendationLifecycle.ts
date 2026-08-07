/**
 * lib/recommendationLifecycle.ts
 *
 * Server-only helpers for the full Founder Intelligence recommendation
 * lifecycle: shown, seen, accepted, started, completed, skipped, delayed,
 * replaced, blocked, and evidence produced.
 *
 * This intentionally reuses reflexion_learning_log. It makes lifecycle state
 * machine-readable without creating a parallel tracking system.
 */

import { logError } from "@/lib/server/logger";
import type { ActionOutcome } from "@/lib/learning";

type SupabaseLike = { from: (table: string) => any };

export type RecommendationLifecycleEventType =
  | "shown"
  | "seen"
  | "accepted"
  | "started"
  | "completed"
  | "skipped"
  | "delayed"
  | "replaced"
  | "blocked"
  | "evidence_recorded";

export type OutcomeQuality = "none" | "weak" | "useful" | "strong";

export interface RecommendationLifecycleEvent {
  type: RecommendationLifecycleEventType;
  at: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

function appendEventExpression(event: RecommendationLifecycleEvent) {
  return {
    lifecycle_events: event,
  };
}

function mapOutcomeToLifecycle(outcome: string): {
  outcome: ActionOutcome;
  event: RecommendationLifecycleEventType;
  quality: OutcomeQuality;
} {
  const normalized = outcome.toLowerCase();
  if (normalized === "completed" || normalized === "done") {
    return { outcome: "completed", event: "completed", quality: "useful" };
  }
  if (normalized === "blocked") {
    return { outcome: "partial", event: "blocked", quality: "weak" };
  }
  if (normalized === "skipped") {
    return { outcome: "overridden", event: "skipped", quality: "none" };
  }
  if (normalized === "delayed") {
    return { outcome: "partial", event: "delayed", quality: "none" };
  }
  return { outcome: "partial", event: "started", quality: "weak" };
}

async function updateLatestPending(
  supabase: SupabaseLike,
  userId: string,
  patch: Record<string, unknown>,
): Promise<string | null> {
  const { data: pending, error: findError } = await supabase
    .from("reflexion_learning_log")
    .select("id, lifecycle_events")
    .eq("user_id", userId)
    .eq("outcome", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (findError) throw findError;
  if (!pending?.id) return null;

  const currentEvents = Array.isArray(pending.lifecycle_events) ? pending.lifecycle_events : [];
  const event = patch.lifecycle_events as RecommendationLifecycleEvent | undefined;
  const nextPatch = event
    ? { ...patch, lifecycle_events: [...currentEvents, event] }
    : patch;

  const { error: updateError } = await supabase
    .from("reflexion_learning_log")
    .update(nextPatch)
    .eq("id", pending.id);

  if (updateError) throw updateError;
  return pending.id as string;
}

export async function markRecommendationLifecycle(
  supabase: SupabaseLike,
  params: {
    userId: string;
    event: RecommendationLifecycleEventType;
    note?: string;
    metadata?: Record<string, unknown>;
    delayedUntil?: string;
    replacedBy?: string;
    evidenceProduced?: string;
    founderExplanation?: string;
    outcome?: string;
  },
): Promise<string | null> {
  try {
    const now = new Date().toISOString();
    const event: RecommendationLifecycleEvent = {
      type: params.event,
      at: now,
      note: params.note,
      metadata: params.metadata,
    };

    const patch: Record<string, unknown> = appendEventExpression(event);
    if (params.event === "seen") patch.seen_at = now;
    if (params.event === "accepted") patch.accepted_at = now;
    if (params.event === "started") patch.started_at = now;
    if (params.event === "skipped") patch.skipped_at = now;
    if (params.event === "delayed") patch.delayed_until = params.delayedUntil ?? now;
    if (params.event === "replaced") {
      patch.replaced_at = now;
      patch.replaced_by = params.replacedBy ?? null;
    }
    if (params.event === "blocked") {
      patch.blocked_at = now;
      patch.blocked_reason = params.note ?? null;
    }
    if (params.founderExplanation) patch.founder_explanation = params.founderExplanation;
    if (params.evidenceProduced) patch.evidence_produced = params.evidenceProduced;

    if (params.outcome) {
      const mapped = mapOutcomeToLifecycle(params.outcome);
      patch.outcome = mapped.outcome;
      patch.outcome_recorded_at = now;
      patch.outcome_quality = params.evidenceProduced ? "strong" : mapped.quality;
    }

    return await updateLatestPending(supabase, params.userId, patch);
  } catch (err) {
    logError("recommendationLifecycle/markRecommendationLifecycle", err, { userId: params.userId, event: params.event });
    return null;
  }
}

export async function markRecommendationObserved(
  supabase: SupabaseLike,
  params: {
    userId: string;
    taskTitle: string;
    outcome: string;
    founderExplanation?: string;
    evidenceProduced?: string;
  },
): Promise<string | null> {
  const mapped = mapOutcomeToLifecycle(params.outcome);
  return markRecommendationLifecycle(supabase, {
    userId: params.userId,
    event: mapped.event,
    note: params.taskTitle,
    outcome: params.outcome,
    founderExplanation: params.founderExplanation,
    evidenceProduced: params.evidenceProduced,
    metadata: { taskTitle: params.taskTitle },
  });
}
