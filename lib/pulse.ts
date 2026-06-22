/**
 * lib/pulse.ts — Pulse Event Intelligence System
 *
 * Pulse is BuildMind's canonical founder event log and scoring engine.
 * Every meaningful action a founder takes emits one row to pulse_events.
 * All scores, reports, streaks, and behavioral intelligence read from here.
 *
 * Usage:
 *   import { emitPulse, PulseEventType } from "@/lib/pulse";
 *
 *   // In any API route after a meaningful action:
 *   await emitPulse(userId, "task_completed", projectId, {
 *     quality: 4,
 *     stage: "Validation",
 *     metadata: { task_title: "Ship onboarding modal", action_type: "build" },
 *   });
 *
 * The function is intentionally non-blocking — it never fails a route if
 * the pulse insert fails. The score recompute is fire-and-forget.
 */

import { createAdminClient } from "@/lib/supabase/admin";

// ── Event types ───────────────────────────────────────────────────────────────

export type PulseEventType =
  | "task_accepted"       // founder accepted the AI-generated task for today
  | "task_completed"      // founder marked today's task done
  | "task_overridden"     // founder rejected the AI task (negative signal)
  | "reflection_logged"   // founder submitted a reflection after check-in
  | "stage_advanced"      // startup stage promoted
  | "break_used"          // Break My Startup analysis run
  | "report_generated"    // weekly report generated
  | "coach_session"       // AI coach conversation completed
  | "streak_milestone"    // streak hit a named threshold
  | "app_open"            // app session started (low weight)
  | "share_published";    // share card or report shared publicly

// ── Emit options ──────────────────────────────────────────────────────────────

export interface PulseEmitOptions {
  /**
   * Quality signal 1–5. Maps directly to reflection confidence where applicable.
   * For task_completed: 1 = bare completion, 5 = completion + rich reflection.
   * For stage_advanced: always pass 5.
   * Omit for binary events (break_used, app_open, share_published).
   */
  quality?: number;

  /** Startup stage at time of event (e.g. "Validation") */
  stage?: string;

  /** Arbitrary context — stored in JSONB metadata column */
  metadata?: Record<string, unknown>;

  /**
   * Weight override — bypasses the pulse_event_weights table.
   * Use sparingly: only for exceptional events (e.g. first-ever task,
   * 100-day streak milestone) where the base weight is insufficient.
   */
  weightOverride?: number;
}

// ── Derived metrics ───────────────────────────────────────────────────────────

export interface PulseMetrics {
  /** 0–100. The canonical BuildMind execution quality score. */
  pulseScore: number;

  /**
   * Consecutive calendar days with at least one positive-weight event.
   * Stricter than a check-in streak — requires execution, not just presence.
   */
  pulseStreak: number;

  /**
   * Average daily Pulse Score over the last 7 days.
   * The trend direction (up/down/flat) feeds the weekly report.
   */
  velocity7d: number;

  /**
   * Ratio of positive weight to total weight over the last 14 days.
   * 1.0 = no overrides, 0.5 = half the events are negative-signal.
   * Feeds the "Signal Ratio" display on the share card.
   */
  signalRatio: number;

  /**
   * The single highest-weight event type in the last 14 days.
   * Shown on the share card as "Peak signal: stage_advanced".
   */
  peakEventType: PulseEventType | null;

  /** Total events in the last 14 days */
  eventsCount: number;
}

// ── Core emit function ────────────────────────────────────────────────────────

/**
 * Emit a Pulse event. Non-blocking — wraps in try/catch so a DB failure
 * never propagates to the calling route.
 *
 * After a successful insert, asynchronously refreshes the founder's daily
 * Pulse Score via the upsert_pulse_score() Postgres function.
 */
export async function emitPulse(
  userId: string,
  eventType: PulseEventType,
  projectId: string | null | undefined,
  options: PulseEmitOptions = {},
): Promise<void> {
  if (!userId) return;

  const { quality, stage, metadata = {}, weightOverride } = options;

  try {
    const supabase = createAdminClient();

    await supabase.from("pulse_events").insert({
      user_id:         userId,
      project_id:      projectId ?? null,
      event_type:      eventType,
      quality:         quality ?? null,
      stage:           stage ?? null,
      metadata,
      weight_override: weightOverride ?? null,
      occurred_at:     new Date().toISOString(),
    });

    // Async score refresh — never awaited, never blocks the calling route
    Promise.resolve(supabase.rpc("upsert_pulse_score", { p_user_id: userId })).then(() => {}).catch(() => {});
  } catch {
    // Pulse is non-fatal — never propagate
  }
}

// ── Batch emit ────────────────────────────────────────────────────────────────

/**
 * Emit multiple events atomically. Use when a single user action triggers
 * multiple signals (e.g. task_completed + streak_milestone on day 7).
 */
export async function emitPulseBatch(
  userId: string,
  events: Array<{
    eventType: PulseEventType;
    projectId?: string | null;
    options?: PulseEmitOptions;
  }>,
): Promise<void> {
  if (!userId || events.length === 0) return;

  try {
    const supabase = createAdminClient();

    const rows = events.map(({ eventType, projectId, options = {} }) => ({
      user_id:         userId,
      project_id:      projectId ?? null,
      event_type:      eventType,
      quality:         options.quality ?? null,
      stage:           options.stage ?? null,
      metadata:        options.metadata ?? {},
      weight_override: options.weightOverride ?? null,
      occurred_at:     new Date().toISOString(),
    }));

    await supabase.from("pulse_events").insert(rows);

    Promise.resolve(supabase.rpc("upsert_pulse_score", { p_user_id: userId })).then(() => {}).catch(() => {});
  } catch {
    // Non-fatal
  }
}

// ── Read metrics ──────────────────────────────────────────────────────────────

/**
 * Fetch derived Pulse metrics for a founder. Used by:
 *   - Weekly report route (replaces manual task count + momentum formula)
 *   - Share card route
 *   - Progress page
 *   - Morning briefing context
 */
export async function getPulseMetrics(userId: string): Promise<PulseMetrics> {
  const fallback: PulseMetrics = {
    pulseScore: 0,
    pulseStreak: 0,
    velocity7d: 0,
    signalRatio: 1,
    peakEventType: null,
    eventsCount: 0,
  };

  if (!userId) return fallback;

  try {
    const supabase = createAdminClient();

    const [scoreResult, streakResult, velocityResult, eventsResult] = await Promise.allSettled([
      // Today's Pulse Score from materialized table (fast)
      supabase
        .from("pulse_scores")
        .select("pulse_score, positive_weight, negative_weight, peak_event_type")
        .eq("user_id", userId)
        .eq("score_date", new Date().toISOString().slice(0, 10))
        .maybeSingle(),

      // Streak via Postgres function
      supabase.rpc("get_pulse_streak", { p_user_id: userId }),

      // 7-day velocity: avg of last 7 daily scores
      supabase
        .from("pulse_scores")
        .select("pulse_score")
        .eq("user_id", userId)
        .gte("score_date", new Date(Date.now() - 7 * 86400 * 1000).toISOString().slice(0, 10))
        .order("score_date", { ascending: false }),

      // Event count last 14 days
      supabase
        .from("pulse_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("occurred_at", new Date(Date.now() - 14 * 86400 * 1000).toISOString()),
    ]);

    const todayScore =
      scoreResult.status === "fulfilled" ? scoreResult.value.data : null;
    const streak =
      streakResult.status === "fulfilled" ? (streakResult.value.data as number ?? 0) : 0;
    const scores7d =
      velocityResult.status === "fulfilled" ? (velocityResult.value.data ?? []) : [];
    const eventsCount =
      eventsResult.status === "fulfilled" ? (eventsResult.value.count ?? 0) : 0;

    const velocity7d =
      scores7d.length > 0
        ? Math.round(
            scores7d.reduce((sum: number, r: { pulse_score: number }) => sum + r.pulse_score, 0) /
            scores7d.length * 10
          ) / 10
        : 0;

    const posWeight = todayScore?.positive_weight ?? 0;
    const negWeight = todayScore?.negative_weight ?? 0;
    const totalWeight = posWeight + negWeight;
    const signalRatio = totalWeight > 0 ? Math.round((posWeight / totalWeight) * 1000) / 1000 : 1;

    return {
      pulseScore:    todayScore?.pulse_score ?? 0,
      pulseStreak:   streak,
      velocity7d,
      signalRatio,
      peakEventType: (todayScore?.peak_event_type as PulseEventType) ?? null,
      eventsCount,
    };
  } catch {
    return fallback;
  }
}

// ── Streak milestone helper ───────────────────────────────────────────────────

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 365] as const;
export type StreakMilestone = (typeof STREAK_MILESTONES)[number];

/**
 * After every task completion, call this to check if the new streak
 * crosses a named milestone. Returns the milestone if crossed, null otherwise.
 * Caller should then emit a streak_milestone event with weightOverride=8.
 */
export function checkStreakMilestone(
  previousStreak: number,
  newStreak: number,
): StreakMilestone | null {
  for (const milestone of STREAK_MILESTONES) {
    if (previousStreak < milestone && newStreak >= milestone) {
      return milestone;
    }
  }
  return null;
}

// ── Weekly window query ───────────────────────────────────────────────────────

export interface PulseWeekSummary {
  /** Total positive-weight events this week */
  positiveEvents: number;
  /** Total negative-weight events (overrides, blocked reflections) */
  negativeEvents: number;
  /** Sum of raw weights this week (unnormalized) */
  rawWeightSum: number;
  /** Highest-weight single event this week */
  peakEvent: { type: PulseEventType; quality: number | null; occurred_at: string } | null;
  /** Stage advances this week */
  stageAdvances: number;
  /** Reflection quality scores this week (for avg confidence) */
  reflectionQualities: number[];
  /** Execution trend vs previous 7 days: "up" | "down" | "flat" */
  executionTrend: "up" | "down" | "flat";
}

/**
 * Rich weekly summary used by the weekly report route.
 * Replaces the ad-hoc counting from four separate tables.
 */
export async function getPulseWeekSummary(
  userId: string,
  projectId?: string,
): Promise<PulseWeekSummary> {
  const fallback: PulseWeekSummary = {
    positiveEvents: 0,
    negativeEvents: 0,
    rawWeightSum: 0,
    peakEvent: null,
    stageAdvances: 0,
    reflectionQualities: [],
    executionTrend: "flat",
  };

  if (!userId) return fallback;

  try {
    const supabase = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400 * 1000).toISOString();

    // Fetch current week + previous week scores for trend
    const [thisWeekResult, prevWeekResult] = await Promise.allSettled([
      supabase
        .from("pulse_events")
        .select("event_type, quality, occurred_at, weight_override, metadata")
        .eq("user_id", userId)
        .gte("occurred_at", sevenDaysAgo)
        .order("occurred_at", { ascending: false }),

      supabase
        .from("pulse_scores")
        .select("pulse_score")
        .eq("user_id", userId)
        .gte("score_date", fourteenDaysAgo.slice(0, 10))
        .lt("score_date", sevenDaysAgo.slice(0, 10)),
    ]);

    const thisWeekEvents =
      thisWeekResult.status === "fulfilled" ? (thisWeekResult.value.data ?? []) : [];
    const prevWeekScores =
      prevWeekResult.status === "fulfilled" ? (prevWeekResult.value.data ?? []) : [];

    // Fetch weights once
    const { data: weightRows } = await supabase
      .from("pulse_event_weights")
      .select("event_type, base_weight, negative");

    const weightMap = new Map<string, { base_weight: number; negative: boolean }>(
      (weightRows ?? []).map((w) => [w.event_type, w]),
    );

    let positiveEvents = 0;
    let negativeEvents = 0;
    let rawWeightSum = 0;
    let peakWeight = -1;
    let peakEvent: PulseWeekSummary["peakEvent"] = null;
    let stageAdvances = 0;
    const reflectionQualities: number[] = [];

    for (const event of thisWeekEvents) {
      const w = weightMap.get(event.event_type);
      if (!w) continue;

      const effectiveWeight = event.weight_override ?? w.base_weight;

      if (w.negative) {
        negativeEvents++;
        rawWeightSum -= effectiveWeight;
      } else {
        positiveEvents++;
        rawWeightSum += effectiveWeight;

        if (effectiveWeight > peakWeight) {
          peakWeight = effectiveWeight;
          peakEvent = {
            type: event.event_type as PulseEventType,
            quality: event.quality,
            occurred_at: event.occurred_at,
          };
        }
      }

      if (event.event_type === "stage_advanced") stageAdvances++;
      if (event.event_type === "reflection_logged" && event.quality) {
        reflectionQualities.push(event.quality);
      }
    }

    // Trend: compare this week's avg score vs previous week's avg
    const thisWeekAvg = positiveEvents > 0 ? rawWeightSum / Math.max(positiveEvents, 1) : 0;
    const prevWeekAvg =
      prevWeekScores.length > 0
        ? prevWeekScores.reduce((s: number, r: { pulse_score: number }) => s + r.pulse_score, 0) /
          prevWeekScores.length
        : 0;

    const delta = thisWeekAvg - prevWeekAvg;
    const executionTrend: "up" | "down" | "flat" =
      delta > 2 ? "up" : delta < -2 ? "down" : "flat";

    return {
      positiveEvents,
      negativeEvents,
      rawWeightSum: Math.round(rawWeightSum * 100) / 100,
      peakEvent,
      stageAdvances,
      reflectionQualities,
      executionTrend,
    };
  } catch {
    return fallback;
  }
}
