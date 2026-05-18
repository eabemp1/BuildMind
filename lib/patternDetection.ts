/**
 * lib/patternDetection.ts — Automatic behavioural pattern detection
 *
 * Playbook §3.2 Stage 2 — Pattern Detection Layer (Month 2)
 * Fires automatically from:
 *   1. Evening check cron (batch scan all active users)
 *   2. /api/founder-context/task-complete (per-user after every check-in)
 *
 * Four signals the agent watches:
 *   AVOIDANCE      — same task category appears 3+ times without completion
 *   OVERRIDE_CLUSTER — founder rejects same category repeatedly
 *   MOMENTUM_DECAY — score dropping week over week
 *   TOPIC_REPEAT   — same subject mentioned without action
 *
 * When a pattern fires, the agent surfaces it directly in the next session.
 * "You have added this to your list three times. Remove it or tell me what's blocking you."
 *
 * No ML required — if-then logic on the founder_context object, exactly as
 * specified in Playbook §3.3.
 */

export type PatternSignal =
  | "avoidance"
  | "override_cluster"
  | "momentum_decay"
  | "topic_repeat"
  | null;

export interface PatternResult {
  signal: PatternSignal;
  /** Human-readable description the AI can surface verbatim */
  message: string;
  /** Category/topic that triggered the signal, for context injection */
  subject: string | null;
  /** Severity: how urgently should this be surfaced */
  severity: "low" | "medium" | "high";
}

export interface PatternContext {
  avoidance_zones: string[];
  override_reasons: string[];
  tasks_overridden_this_week: number;
  tasks_accepted_this_week: number;
  momentum_score: number;
  momentum_last_week?: number | null;
  topics_mentioned_repeatedly: string[];
  /** Raw task titles from the last 14 days — used to detect avoidance loops */
  recent_task_titles?: string[];
  days_inactive: number;
}

const NO_PATTERN: PatternResult = {
  signal: null,
  message: "",
  subject: null,
  severity: "low",
};

/**
 * detectPattern — run all four signal checks in priority order.
 * Returns the highest-priority active pattern, or NO_PATTERN.
 * Called server-side only — never expose raw context to the client.
 */
export function detectPattern(ctx: PatternContext): PatternResult {
  // ── 1. AVOIDANCE — same zone appears 3+ times in recent tasks without completion ──
  if (ctx.avoidance_zones.length > 0) {
    // Pick the most chronic avoidance zone (first in list = oldest pattern)
    const zone = ctx.avoidance_zones[0];
    const timesAppeared = (ctx.recent_task_titles ?? []).filter(t =>
      t.toLowerCase().includes(zone.toLowerCase())
    ).length;

    if (timesAppeared >= 3) {
      return {
        signal: "avoidance",
        message: `You have avoided "${zone}" tasks ${timesAppeared} times this week. Remove it from your plan or tell me what's actually blocking it — pretending it doesn't exist is costing you more than doing it.`,
        subject: zone,
        severity: "high",
      };
    }

    // Softer avoidance: zone is known but hasn't appeared as tasks yet
    if (ctx.avoidance_zones.length >= 2) {
      return {
        signal: "avoidance",
        message: `You consistently avoid ${ctx.avoidance_zones.slice(0, 2).join(" and ")}. This week, one of those needs to happen before anything else.`,
        subject: ctx.avoidance_zones[0],
        severity: "medium",
      };
    }
  }

  // ── 2. OVERRIDE_CLUSTER — founder rejected same category 3+ times ──
  const overrideRate = ctx.tasks_overridden_this_week /
    Math.max(1, ctx.tasks_accepted_this_week + ctx.tasks_overridden_this_week);

  if (ctx.tasks_overridden_this_week >= 3 && overrideRate >= 0.5) {
    // Try to extract the repeated override theme from override_reasons
    const reasons = ctx.override_reasons ?? [];
    const reasonSummary = reasons.length > 0
      ? `Your reasons: "${reasons.slice(-2).join('", "')}".`
      : "";

    return {
      signal: "override_cluster",
      message: `You've overridden ${ctx.tasks_overridden_this_week} of your last ${ctx.tasks_accepted_this_week + ctx.tasks_overridden_this_week} tasks. ${reasonSummary} That pattern usually means one of two things: the tasks are wrong for your current energy, or you've decided something without telling the system. Which is it?`,
      subject: reasons[reasons.length - 1] ?? null,
      severity: "high",
    };
  }

  // ── 3. MOMENTUM_DECAY — score dropping week over week ──
  const lastWeek = ctx.momentum_last_week;
  if (
    typeof lastWeek === "number" &&
    ctx.momentum_score < lastWeek - 10 &&
    ctx.momentum_score < 50
  ) {
    const drop = Math.round(lastWeek - ctx.momentum_score);
    return {
      signal: "momentum_decay",
      message: `Your momentum has dropped ${drop} points this week. This is the window where most founders quietly stop. One completed task today stops the decay — it doesn't have to be big.`,
      subject: null,
      severity: ctx.momentum_score < 35 ? "high" : "medium",
    };
  }

  // ── 4. TOPIC_REPEAT — same subject mentioned without action ──
  if (ctx.topics_mentioned_repeatedly.length > 0) {
    const topic = ctx.topics_mentioned_repeatedly[0];
    return {
      signal: "topic_repeat",
      message: `You've mentioned "${topic}" multiple times this week without taking action on it. Run a 5-minute stress test on it today — or make a decision to drop it entirely. Thinking about it repeatedly without acting is the most expensive thing you're doing right now.`,
      subject: topic,
      severity: "medium",
    };
  }

  return NO_PATTERN;
}

/**
 * buildPatternPromptInjection — converts a PatternResult into a prompt string
 * that can be injected into the evening check nudge or morning briefing generator.
 * Returns empty string if no pattern.
 */
export function buildPatternPromptInjection(pattern: PatternResult): string {
  if (!pattern.signal) return "";
  return `\n\nPATTERN DETECTION ALERT — ${pattern.signal.toUpperCase()}:
The system has detected a behavioural pattern that must be surfaced in this response.
Do NOT wait for the founder to raise this themselves.
Open with this observation before anything else: "${pattern.message}"
Severity: ${pattern.severity}. ${pattern.severity === "high" ? "Name it directly — no softening." : "Name it with care, but name it."}\n`;
}

/**
 * shouldSurfacePattern — rate-limits pattern surfacing so it isn't repetitive.
 * Returns true if enough time has passed since the pattern was last shown.
 * Uses a simple day-based check — pattern shown once per 2 days max.
 */
export function shouldSurfacePattern(
  lastPatternShownAt: string | null | undefined,
  severity: PatternResult["severity"],
): boolean {
  if (!lastPatternShownAt) return true;
  const last = new Date(lastPatternShownAt).getTime();
  const now = Date.now();
  const cooldownMs = severity === "high"
    ? 24 * 60 * 60 * 1000       // high severity: once per day
    : 48 * 60 * 60 * 1000;      // medium/low: once per 2 days
  return now - last > cooldownMs;
}
