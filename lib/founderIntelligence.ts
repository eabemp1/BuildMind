import { buildExecutionSignature, type ExecutionSignature, type TaskRecord } from "@/lib/outcomeCorrelation";
import { buildTemporalProfile, type SessionEvent, type TemporalProfile } from "@/lib/temporalPatterns";
import { deriveLearnedPatterns, type LearnedPatterns, type LearningLogRow } from "@/lib/learning";
import { logError } from "@/lib/server/logger";
import { buildTemporalComparison } from "@/lib/temporalCoherence";
import { buildCofounderJudgment } from "@/lib/cofounderJudgment";

type SupabaseLike = {
  from: (table: string) => any;
};

export type IntelligenceSignalType =
  | "GOAL_SLIPPAGE"
  | "BEHAVIOR_STRATEGY_CONTRADICTION"
  | "REPEATED_AVOIDANCE"
  | "EVIDENCE_GAP"
  | "ASSUMPTION_DECAY"
  | "EXECUTION_DEGRADATION"
  | "BUSYWORK_PATTERN"
  | "RECOMMENDATION_REJECTION_PATTERN"
  | "MOMENTUM_CHANGE"
  | "FOUNDER_BEHAVIOR_CHANGE";

export type SignalSeverity = "low" | "medium" | "high" | "critical";

export interface SignalEvidence {
  source: string;
  detail: string;
  count?: number;
  window?: string;
}

export interface IntelligenceSignal {
  type: IntelligenceSignalType;
  severity: SignalSeverity;
  confidence: number;
  title: string;
  summary: string;
  evidence: SignalEvidence[];
  detected_at: string;
  expires_at?: string;
  affected_goal?: string | null;
  affected_assumption?: string | null;
  recommended_response: string;
}

export interface FounderState {
  strengths: string[];
  avoidance_patterns: string[];
  execution_patterns: string[];
  operating_windows: string[];
  recommendation_acceptance: string[];
  recommendation_rejection: string[];
  behavioral_trends: string[];
  confidence: number;
  recent_changes: string[];
  corrections: Array<{ belief: string; correction: string; evidence?: string; created_at?: string }>;
}

export interface StartupState {
  current_goal: string | null;
  active_milestones: string[];
  stalled_milestones: string[];
  current_projects: string[];
  evidence: string[];
  assumptions: string[];
  risks: string[];
  metrics: Record<string, number | string | null>;
  strategic_priorities: string[];
  recent_changes: string[];
}

export interface StrategyState {
  stated_priorities: string[];
  observed_priorities: string[];
  contradictions: string[];
  strategic_drift: string[];
  priority_confidence: number;
}

export interface ExecutionState {
  completed_actions: string[];
  skipped_actions: string[];
  delayed_actions: string[];
  repeated_actions: string[];
  outcome_quality: string[];
  execution_velocity: number;
}

export interface TemporalCoherenceState {
  today_changes: string[];
  week_changes: string[];
  week_over_week_changes: string[];
  increasing_behaviors: string[];
  decreasing_behaviors: string[];
  strengthening_patterns: string[];
  weakening_patterns: string[];
}

export interface DecisionCandidate {
  id: string;
  action: string;
  rationale: string;
  expected_evidence: string;
  scores: {
    impact: number;
    urgency: number;
    goal_relevance: number;
    evidence_value: number;
    founder_fit: number;
    execution_probability: number;
    opportunity_cost: number;
    repetition_penalty: number;
    behavioral_correction: number;
    risk_reduction: number;
    confidence: number;
    total: number;
  };
  supporting_signals: IntelligenceSignalType[];
  why_it_beats_alternatives: string;
}

export interface DecisionState {
  candidates: DecisionCandidate[];
  top_candidate: DecisionCandidate | null;
  decision_basis: string[];
}

export interface FounderIntelligenceState {
  founder: FounderState;
  startup: StartupState;
  strategy: StrategyState;
  execution: ExecutionState;
  temporal: TemporalCoherenceState;
  signals: IntelligenceSignal[];
  decision: DecisionState;
  /**
   * Per-archetype (candidate.id) success/failure counts from this founder's
   * own resolved Founder Intelligence predictions (lib/learningLoop.ts).
   * Read by scoreCandidate() as the Beta posterior for Thompson Sampling —
   * this is what makes candidate ranking learn from THIS founder specifically
   * instead of using the same fixed weights for everyone. Empty for a new
   * founder with no resolved predictions yet, which is the correct cold-start
   * state: scoreCandidate() falls back to Beta(1,1) — a neutral prior, not a
   * penalty — so ranking behaves exactly as it did before this existed.
   */
  archetype_stats: Record<string, { successes: number; failures: number }>;
  source_summary: {
    reflections: number;
    learning_logs: number;
    activity_events: number;
    milestones: number;
    tasks: number;
    action_logs: number;
  };
  generated_at: string;
}

export interface FounderIntelligenceInput {
  founderContext?: Record<string, any> | null;
  founderMemory?: Record<string, any> | null;
  project?: Record<string, any> | null;
  milestones?: Array<Record<string, any>>;
  tasks?: Array<Record<string, any>>;
  reflections?: Array<Record<string, any>>;
  learningLogs?: LearningLogRow[];
  activityEvents?: SessionEvent[];
  actionLogs?: Array<Record<string, any>>;
  now?: Date;
  /** FIX (task-repeat bug): a task the founder just explicitly rejected
   *  (e.g. via "Replace this task") to exclude from candidate ranking.
   *  Without this, buildDecisionState()'s candidate pool is a small fixed
   *  set keyed purely off which signal types are active — since signals
   *  barely change within the few seconds around a replace click, the
   *  exact same candidate would win the ranking again every time. See
   *  buildDecisionState() below for where this is actually applied. */
  excludeAction?: string;
  /**
   * One decision authority, not N independent generators: if present and
   * dated today, buildFounderIntelligenceState() uses this DecisionState
   * as-is instead of calling buildDecisionState() (which would draw a new
   * Thompson Sampling sample and could land on a different top candidate
   * purely from sampling variance, not from anything actually changing
   * about the founder's situation). Ignored when excludeAction is set —
   * an explicit "give me something else" should always compute fresh.
   */
  cachedDecision?: { decision: DecisionState; date: string } | null;
}

const EXTERNAL_KEYWORDS = /\b(user|customer|interview|feedback|talked|called|met|spoke|revenue|sale|paid|pricing|launch|publish|post|pitch|email|reach out|dm|contact)\b/i;
const REVENUE_KEYWORDS = /\b(revenue|sale|paid|pricing|price|charge|payment|mrr|arr|invoice|subscription|upsell|close)\b/i;
const USER_EVIDENCE_KEYWORDS = /\b(user|customer|interview|feedback|talked|called|met|spoke|reply|response|commitment|preorder|paid|payment|signed up|signup)\b/i;

function clampScore(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function confidenceFromCounts(count: number, reliableAt: number): number {
  return Math.max(0.2, Math.min(0.95, count / reliableAt));
}

function unique(values: Array<string | null | undefined>, limit = 8): string[] {
  return [...new Set(values.map((v) => String(v ?? "").trim()).filter(Boolean))].slice(0, limit);
}

function daysBetween(now: Date, iso?: string | null): number {
  if (!iso) return 999;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 999;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

function recentWithin<T extends Record<string, any>>(rows: T[], now: Date, days: number, field = "created_at"): T[] {
  const cutoff = now.getTime() - days * 86_400_000;
  return rows.filter((r) => {
    const raw = r[field] ?? r.occurred_at ?? r.updated_at;
    const t = raw ? new Date(raw).getTime() : 0;
    return t >= cutoff;
  });
}

function recencyWeight(now: Date, iso?: string | null, halfLifeDays = 21): number {
  const age = daysBetween(now, iso);
  if (age <= 0) return 1;
  if (age >= 365) return 0.05;
  return Math.max(0.05, Math.pow(0.5, age / halfLifeDays));
}

function weightedCompletedEvidence(reflections: Array<Record<string, any>>, now: Date): number {
  return reflections.reduce((sum, r) => {
    const completed = r.outcome === "completed" || r.outcome === "done";
    if (!completed) return sum;
    const hasEvidence = USER_EVIDENCE_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""} ${r.what_happened ?? ""} ${r.what_learned ?? ""}`);
    return hasEvidence ? sum + recencyWeight(now, r.created_at, 14) : sum;
  }, 0);
}

function signal(params: Omit<IntelligenceSignal, "detected_at"> & { now: Date }): IntelligenceSignal {
  return {
    ...params,
    detected_at: params.now.toISOString(),
  };
}

function stagePriority(stage: string): string {
  const s = stage.toLowerCase();
  if (s.includes("revenue")) return "close or expand paid usage";
  if (s.includes("growth")) return "retain users while growing a repeatable channel";
  if (s.includes("launch")) return "drive qualified users through one repeatable channel";
  if (s.includes("mvp")) return "ship to real users and observe usage";
  if (s.includes("validation")) return "collect commitment evidence from target users";
  return "validate the core problem with real people";
}

function actionCategory(text: string): string {
  const t = text.toLowerCase();
  if (REVENUE_KEYWORDS.test(t)) return "revenue";
  if (/\b(message|dm|email|reach out|contact|call|talk|interview|feedback)\b/i.test(t)) return "customer evidence";
  if (/\b(build|ship|code|implement|deploy|fix|feature)\b/i.test(t)) return "build";
  if (/\b(write|post|publish|content|tweet|thread|blog)\b/i.test(t)) return "distribution";
  if (/\b(research|review|analyze|read|study|compare)\b/i.test(t)) return "research";
  return "operations";
}

export function deriveTemporalCoherence(input: FounderIntelligenceInput): TemporalCoherenceState {
  const now = input.now ?? new Date();
  const comparison = buildTemporalComparison(input);
  const reflections = input.reflections ?? [];
  const learningLogs = input.learningLogs ?? [];
  const actions = input.actionLogs ?? [];
  const thisWeekReflections = recentWithin(reflections, now, 7);
  const lastWeekReflections = reflections.filter((r) => {
    const age = daysBetween(now, r.created_at);
    return age >= 7 && age < 14;
  });
  const thisWeekCompleted = thisWeekReflections.filter((r) => r.outcome === "completed" || r.outcome === "done").length;
  const lastWeekCompleted = lastWeekReflections.filter((r) => r.outcome === "completed" || r.outcome === "done").length;
  const thisWeekLogs = recentWithin(learningLogs, now, 7);
  const lastWeekLogs = learningLogs.filter((r) => {
    const age = daysBetween(now, r.created_at);
    return age >= 7 && age < 14;
  });
  const thisWeekExternal = thisWeekReflections.filter((r) => EXTERNAL_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""}`)).length;
  const lastWeekExternal = lastWeekReflections.filter((r) => EXTERNAL_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""}`)).length;
  const today = recentWithin([...reflections, ...actions], now, 1);

  const week_changes: string[] = [];
  if (thisWeekReflections.length || lastWeekReflections.length) {
    week_changes.push(`Completed ${thisWeekCompleted}/${thisWeekReflections.length} reflected actions this week vs ${lastWeekCompleted}/${lastWeekReflections.length} last week.`);
  }
  if (thisWeekExternal !== lastWeekExternal) {
    week_changes.push(`External evidence actions moved from ${lastWeekExternal} last week to ${thisWeekExternal} this week.`);
  }
  if (thisWeekLogs.length || lastWeekLogs.length) {
    const rejectedNow = thisWeekLogs.filter((r) => r.outcome === "overridden" || r.outcome === "ignored").length;
    const rejectedBefore = lastWeekLogs.filter((r) => r.outcome === "overridden" || r.outcome === "ignored").length;
    week_changes.push(`Recommendation rejection moved from ${rejectedBefore} last week to ${rejectedNow} this week.`);
  }

  return {
    today_changes: unique([...comparison.changed_today, ...(today.length ? [`${today.length} founder activity/reflection events recorded today.`] : [])], 6),
    week_changes: unique([...week_changes, ...comparison.changed_this_week, ...comparison.since_last_decision], 8),
    week_over_week_changes: unique([...week_changes, ...comparison.week_over_week], 8),
    increasing_behaviors: unique([...comparison.increasing, ...(thisWeekExternal > lastWeekExternal ? ["external evidence seeking"] : [])], 5),
    decreasing_behaviors: unique([...comparison.decreasing, ...(thisWeekExternal < lastWeekExternal ? ["external evidence seeking"] : [])], 5),
    strengthening_patterns: unique([
      ...(thisWeekCompleted < lastWeekCompleted ? ["execution slowdown"] : []),
      comparison.recommendation_effectiveness.trend === "down" ? "recommendation effectiveness decay" : null,
    ], 5),
    weakening_patterns: unique([
      ...(thisWeekCompleted > lastWeekCompleted ? ["execution slowdown"] : []),
      comparison.recommendation_effectiveness.trend === "up" ? "recommendation effectiveness decay" : null,
    ], 5),
  };
}

export function deriveIntelligenceSignals(params: {
  input: FounderIntelligenceInput;
  executionSignature: ExecutionSignature;
  temporalProfile: TemporalProfile;
  learnedPatterns: LearnedPatterns;
  temporal: TemporalCoherenceState;
}): IntelligenceSignal[] {
  const { input, executionSignature, temporalProfile, learnedPatterns, temporal } = params;
  const now = input.now ?? new Date();
  const founderContext = input.founderContext ?? {};
  const project = input.project ?? {};
  const reflections = input.reflections ?? [];
  const learningLogs = input.learningLogs ?? [];
  const milestones = input.milestones ?? [];
  const tasks = input.tasks ?? [];
  const signals: IntelligenceSignal[] = [];
  const stage = String(project.startup_stage ?? founderContext.current_stage ?? "Idea");
  const activeMilestone = milestones.find((m) => m.status !== "completed" && m.status !== "abandoned");

  const avoidance = unique([
    ...((founderContext.avoidance_zones ?? []) as string[]),
    ...((input.founderMemory?.avoidance_zones ?? []) as string[]),
    ...executionSignature.avoidanceZones.map((z) => String(z.category)),
    ...learnedPatterns.avoided_action_types,
  ], 6);
  if (avoidance.length > 0) {
    signals.push(signal({
      now,
      type: "REPEATED_AVOIDANCE",
      severity: avoidance.length >= 3 ? "high" : "medium",
      confidence: confidenceFromCounts(avoidance.length + executionSignature.avoidanceZones.length, 5),
      title: "Repeated avoidance pattern detected",
      summary: `BuildMind currently sees avoidance around ${avoidance.slice(0, 3).join(", ")}.`,
      evidence: [
        { source: "founder_context/founder_memory", detail: avoidance.join(", "), count: avoidance.length },
        ...executionSignature.avoidanceZones.slice(0, 2).map((z) => ({ source: "execution_signature", detail: `${z.category}: ${Math.round(z.completionRate * 100)}% completion`, count: z.totalTasks })),
      ],
      affected_goal: activeMilestone?.title ?? null,
      recommended_response: "Prefer a smaller direct exposure to the avoided work rather than routing around it entirely.",
    }));
  }

  const thisWeek = recentWithin(reflections, now, 7);
  const completedThisWeek = thisWeek.filter((r) => r.outcome === "completed" || r.outcome === "done");
  const externalThisWeek = completedThisWeek.filter((r) => EXTERNAL_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""}`));
  if (completedThisWeek.length >= 3 && externalThisWeek.length === 0) {
    signals.push(signal({
      now,
      type: "BUSYWORK_PATTERN",
      severity: "high",
      confidence: confidenceFromCounts(completedThisWeek.length, 5),
      title: "Busywork pattern",
      summary: `${completedThisWeek.length} completed actions this week, but none visibly touched users, revenue, launch, or distribution.`,
      evidence: completedThisWeek.slice(0, 5).map((r) => ({ source: "reflections", detail: String(r.today_action ?? r.note ?? "completed action") })),
      affected_goal: activeMilestone?.title ?? null,
      recommended_response: "Move the next action toward external evidence or revenue signal instead of internal progress.",
    }));
  }

  // Fix: only count reflections that both keyword-match user/customer evidence
  // AND were actually completed (not blocked/abandoned). A blocked attempt to
  // interview users looks like evidence text but produces zero real signal.
  const evidenceRows = recentWithin(reflections, now, 14).filter((r) => {
    const completed = r.outcome === "completed" || r.outcome === "done";
    if (!completed) return false;
    return USER_EVIDENCE_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""} ${r.what_happened ?? ""} ${r.what_learned ?? ""}`);
  });
  if (evidenceRows.length === 0) {
    signals.push(signal({
      now,
      type: "EVIDENCE_GAP",
      severity: stage.toLowerCase().includes("idea") || stage.toLowerCase().includes("validation") ? "critical" : "high",
      confidence: reflections.length >= 3 ? 0.8 : 0.55,
      title: "No recent external evidence",
      summary: "No completed user/customer/revenue actions were detected in the last 14 days. Blocked attempts don't count.",
      evidence: [{ source: "reflections", detail: "No completed reflection in the last 14 days contained confirmed user/customer/revenue evidence.", window: "14 days" }],
      affected_goal: activeMilestone?.title ?? null,
      affected_assumption: project.problem ? `Problem is painful for ${project.target_users ?? "target users"}` : null,
      recommended_response: "Prioritize one action that produces external evidence today.",
    }));
  }

  const activeMilestones = milestones.filter((m) => m.status !== "completed" && m.status !== "abandoned");
  const stalled = activeMilestones.filter((m) => daysBetween(now, m.updated_at ?? m.created_at) >= 7);
  if (stalled.length > 0) {
    signals.push(signal({
      now,
      type: "GOAL_SLIPPAGE",
      severity: stalled.length >= 2 ? "high" : "medium",
      confidence: confidenceFromCounts(stalled.length, 3),
      title: "Goal slippage",
      summary: `${stalled.length} active milestone${stalled.length === 1 ? "" : "s"} have not visibly moved in at least 7 days.`,
      evidence: stalled.slice(0, 3).map((m) => ({ source: "milestones", detail: `${m.title} last updated ${daysBetween(now, m.updated_at ?? m.created_at)} days ago` })),
      affected_goal: stalled[0]?.title ?? null,
      recommended_response: "Pick a next action that directly advances or revalidates the stalest active milestone.",
    }));
  }

  const priority = stagePriority(stage);
  const observedCategories = completedThisWeek.map((r) => actionCategory(String(r.today_action ?? r.note ?? "")));
  const externalObserved = observedCategories.filter((c) => c === "customer evidence" || c === "revenue" || c === "distribution").length;
  if ((stage.toLowerCase().includes("validation") || stage.toLowerCase().includes("revenue") || stage.toLowerCase().includes("launch")) && completedThisWeek.length >= 3 && externalObserved === 0) {
    signals.push(signal({
      now,
      type: "BEHAVIOR_STRATEGY_CONTRADICTION",
      severity: "high",
      confidence: 0.75,
      title: "Behavior contradicts stated strategy",
      summary: `Stated stage priority is to ${priority}, but completed work this week appears internal.`,
      evidence: completedThisWeek.slice(0, 4).map((r) => ({ source: "reflections", detail: String(r.today_action ?? r.note ?? "completed action") })),
      affected_goal: activeMilestone?.title ?? null,
      recommended_response: "Choose a task that makes the stated strategy observable in behavior today.",
    }));
  }

  const rejected = learningLogs.filter((r) => r.outcome === "overridden" || r.outcome === "ignored");
  if (learnedPatterns.patterns_reliable && rejected.length >= 3) {
    signals.push(signal({
      now,
      type: "RECOMMENDATION_REJECTION_PATTERN",
      severity: rejected.length >= 5 ? "high" : "medium",
      confidence: Math.min(0.9, learnedPatterns.total_logged / 12),
      title: "Recommendation rejection pattern",
      summary: `The founder has rejected or ignored ${rejected.length} recent recommendations; avoided types: ${learnedPatterns.avoided_action_types.join(", ") || "not yet specific"}.`,
      evidence: rejected.slice(0, 3).map((r) => ({ source: "reflexion_learning_log", detail: `${r.action_shown} → ${r.outcome}` })),
      recommended_response: "Reduce friction or change channel/type while preserving the strategic goal.",
    }));
  }

  const momentum = Number(founderContext.momentum_score ?? 50);
  const lastWeekMomentum = founderContext.momentum_last_week == null ? null : Number(founderContext.momentum_last_week);
  if (lastWeekMomentum !== null && Math.abs(momentum - lastWeekMomentum) >= 10) {
    signals.push(signal({
      now,
      type: "MOMENTUM_CHANGE",
      severity: momentum < lastWeekMomentum ? "high" : "medium",
      confidence: 0.8,
      title: momentum < lastWeekMomentum ? "Momentum dropped" : "Momentum improved",
      summary: `Momentum moved from ${lastWeekMomentum} to ${momentum}.`,
      evidence: [{ source: "founder_context", detail: `momentum_last_week=${lastWeekMomentum}, momentum_score=${momentum}` }],
      recommended_response: momentum < lastWeekMomentum ? "Assign a smaller high-signal task to restart execution." : "Use the momentum window for a higher-leverage uncomfortable task.",
    }));
  }

  if (temporal.decreasing_behaviors.length > 0 || temporalProfile.sessionLengthTrend === "shrinking") {
    signals.push(signal({
      now,
      type: "FOUNDER_BEHAVIOR_CHANGE",
      severity: "medium",
      confidence: 0.65,
      title: "Founder behavior is changing",
      summary: temporal.decreasing_behaviors.length ? `Decreasing behavior: ${temporal.decreasing_behaviors.join(", ")}.` : "Session length appears to be shrinking.",
      evidence: [{ source: "temporal_profile", detail: temporalProfile.insight ?? `session trend=${temporalProfile.sessionLengthTrend}` }],
      recommended_response: "Adjust task size/timing and explicitly test whether the old operating pattern still holds.",
    }));
  }

  const staleTasks = tasks.filter((t) => !t.is_completed && t.status !== "completed" && daysBetween(now, t.updated_at ?? t.created_at ?? t.due_date) >= 14);
  if (staleTasks.length > 0 && evidenceRows.length === 0) {
    signals.push(signal({
      now,
      type: "ASSUMPTION_DECAY",
      severity: "medium",
      confidence: 0.6,
      title: "Assumption confidence is decaying",
      summary: "Open work is aging while recent external evidence is missing.",
      evidence: staleTasks.slice(0, 3).map((t) => ({ source: "tasks", detail: `${t.title} has been open/stale for ${daysBetween(now, t.updated_at ?? t.created_at ?? t.due_date)} days` })),
      affected_assumption: project.problem ? `Target users need ${project.problem}` : null,
      recommended_response: "Treat the core assumption as untrusted until today's action produces fresh evidence.",
    }));
  }

  const completionRate = thisWeek.length ? completedThisWeek.length / thisWeek.length : null;
  if (completionRate !== null && thisWeek.length >= 4 && completionRate < 0.4) {
    signals.push(signal({
      now,
      type: "EXECUTION_DEGRADATION",
      severity: "high",
      confidence: confidenceFromCounts(thisWeek.length, 7),
      title: "Execution degradation",
      summary: `Only ${Math.round(completionRate * 100)}% of reflected actions were completed this week.`,
      evidence: [{ source: "reflections", detail: `${completedThisWeek.length}/${thisWeek.length} completed`, window: "7 days" }],
      recommended_response: "Make the next action smaller, clearer, and tied to one evidence-producing outcome.",
    }));
  }

  return signals.sort((a, b) => {
    const sev = { critical: 4, high: 3, medium: 2, low: 1 } as const;
    return sev[b.severity] - sev[a.severity] || b.confidence - a.confidence;
  });
}

export function buildFounderIntelligenceState(input: FounderIntelligenceInput): FounderIntelligenceState {
  const now = input.now ?? new Date();
  const founderContext = input.founderContext ?? {};
  const founderMemory = input.founderMemory ?? {};
  const project = input.project ?? {};
  const reflections = input.reflections ?? [];
  const learningLogs = input.learningLogs ?? [];
  const activityEvents = input.activityEvents ?? [];
  const milestones = input.milestones ?? [];
  const tasks = input.tasks ?? [];
  const actionLogs = input.actionLogs ?? [];

  const temporalProfile = buildTemporalProfile(activityEvents, Number(founderContext.timezone_offset ?? 0));
  const taskRecords: TaskRecord[] = reflections.map((r) => ({
    title: String(r.today_action ?? r.note ?? ""),
    completed: r.outcome === "completed" || r.outcome === "done",
    created_at: String(r.created_at ?? now.toISOString()),
    override_reason: r.outcome === "blocked" || r.outcome === "abandoned" ? String(r.blocker ?? r.note ?? "") : null,
  }));
  const executionSignature = buildExecutionSignature(taskRecords, Number(founderContext.momentum_score ?? 50));
  const learnedPatterns = deriveLearnedPatterns(learningLogs);
  const temporal = deriveTemporalCoherence(input);
  const signals = deriveIntelligenceSignals({ input, executionSignature, temporalProfile, learnedPatterns, temporal });
  const thisWeek = recentWithin(reflections, now, 7);
  const completedThisWeek = thisWeek.filter((r) => r.outcome === "completed" || r.outcome === "done");
  const skippedThisWeek = thisWeek.filter((r) => ["blocked", "abandoned", "skipped"].includes(String(r.outcome)));
  const activeMilestones = milestones.filter((m) => m.status !== "completed" && m.status !== "abandoned");
  const stalledMilestones = activeMilestones.filter((m) => daysBetween(now, m.updated_at ?? m.created_at) >= 7);
  const stage = String(project.startup_stage ?? founderContext.current_stage ?? "Idea");
  // FIX (stale placeholder milestone bug): the roadmap seeder
  // (app/api/ai/generate-roadmap/route.ts) creates one milestone per
  // roadmap stage, titled literally "Idea", "Validation", "MVP", "Launch",
  // "Growth". A project's overall stage (project.startup_stage) can
  // advance independently via inferStage() without the founder ever
  // marking that early placeholder card "completed" — so it stays
  // `activeMilestones[0]` (oldest by created_at) forever. That meant
  // current_goal below silently resolved to the literal word "Idea" on
  // projects that had genuinely progressed to Launch/Growth, poisoning
  // every downstream decision-candidate sentence that interpolates
  // current_goal. Prefer a milestone with founder-specific content; only
  // fall back to a placeholder-titled one (then stagePriority) if nothing
  // else is active.
  const ROADMAP_STAGE_PLACEHOLDER_TITLES = new Set(["idea", "validation", "mvp", "launch", "growth", "revenue"]);
  const meaningfulActiveMilestones = activeMilestones.filter(
    (m) => !ROADMAP_STAGE_PLACEHOLDER_TITLES.has(String(m.title ?? "").trim().toLowerCase()),
  );
  const statedPriorities = unique([stagePriority(stage), ...activeMilestones.slice(0, 3).map((m) => m.title)]);
  const observedPriorities = unique(completedThisWeek.map((r) => actionCategory(String(r.today_action ?? r.note ?? ""))));
  const contradictionSignals = signals.filter((s) => s.type === "BEHAVIOR_STRATEGY_CONTRADICTION");

  // Phase 11 learning loop feedback: intelligence_accuracy is written by
  // lib/learningLoop.ts after each resolved Founder Intelligence prediction.
  // It nudges FounderState.confidence and surfaces as a behavioral trend so
  // the product can visibly "get to know" the founder better over time,
  // instead of confidence being a static function of raw row counts.
  const intelligenceAccuracy = founderContext.intelligence_accuracy as { sample_size?: number; average_match_score?: number; trend?: string } | undefined;
  const accuracySampleSize = Number(intelligenceAccuracy?.sample_size ?? 0);
  const accuracyScore = Number(intelligenceAccuracy?.average_match_score ?? 0);
  const accuracyAdjustment = accuracySampleSize >= 3 ? Math.round((accuracyScore - 0.5) * 20) : 0;
  const recentReflectionWeight = reflections.reduce((sum, r) => sum + recencyWeight(now, r.created_at, 21), 0);
  const recentActivityWeight = activityEvents.reduce((sum, a) => sum + recencyWeight(now, a.occurred_at, 14), 0);
  const evidenceWeight = weightedCompletedEvidence(reflections, now);

  const founder: FounderState = {
    strengths: unique([...(founderMemory.strengths ?? []), ...executionSignature.strengths.map((s) => String(s.category)), ...learnedPatterns.preferred_action_types], 8),
    avoidance_patterns: unique([...(founderContext.avoidance_zones ?? []), ...(founderMemory.avoidance_zones ?? []), ...executionSignature.avoidanceZones.map((s) => String(s.category)), ...learnedPatterns.avoided_action_types], 8),
    execution_patterns: unique([executionSignature.signatureSentence, learnedPatterns.patterns_reliable ? `Recommendation completion rate ${Math.round(learnedPatterns.completion_rate * 100)}%` : null], 5),
    operating_windows: unique([temporalProfile.peakProductivityHour != null ? `Best completion hour around ${temporalProfile.peakProductivityHour}:00` : null, temporalProfile.dropoutHour != null ? `Dropout risk around ${temporalProfile.dropoutHour}:00` : null], 4),
    recommendation_acceptance: learnedPatterns.preferred_action_types.map((t) => `Completes ${t} recommendations`),
    recommendation_rejection: unique([...learnedPatterns.avoided_action_types.map((t) => `Avoids ${t} recommendations`), ...learnedPatterns.avoided_platforms.map((p) => `Avoids ${p}`)], 6),
    behavioral_trends: unique([
      ...temporal.increasing_behaviors.map((b) => `${b} increasing`),
      ...temporal.decreasing_behaviors.map((b) => `${b} decreasing`),
      accuracySampleSize >= 3 && intelligenceAccuracy?.trend === "up" ? "Founder Intelligence predictions are getting more accurate" : null,
      accuracySampleSize >= 3 && intelligenceAccuracy?.trend === "down" ? "Founder Intelligence predictions are slipping — model may be stale" : null,
    ], 6),
    confidence: clampScore(
      (learnedPatterns.patterns_reliable ? 25 : 0)
      + Math.min(recentReflectionWeight, 10) * 4
      + Math.min(recentActivityWeight, 20)
      + Math.min(evidenceWeight, 5) * 3
      + accuracyAdjustment,
    ),
    recent_changes: temporal.week_changes.slice(0, 5),
    corrections: Array.isArray(founderMemory.founder_corrections)
      ? founderMemory.founder_corrections.slice(-5).filter((item: unknown): item is { belief: string; correction: string; evidence?: string; created_at?: string } => Boolean(item && typeof item === "object" && "correction" in item))
      : [],
  };

  const startup: StartupState = {
    current_goal: meaningfulActiveMilestones[0]?.title ?? stagePriority(stage),
    active_milestones: activeMilestones.map((m) => String(m.title)).slice(0, 5),
    stalled_milestones: stalledMilestones.map((m) => String(m.title)).slice(0, 5),
    current_projects: unique([project.name, project.title], 3),
    evidence: unique(reflections.filter((r) => {
      const completed = r.outcome === "completed" || r.outcome === "done";
      if (!completed) return false;
      return USER_EVIDENCE_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""} ${r.what_happened ?? ""} ${r.what_learned ?? ""}`);
    }).map((r) => String(r.what_learned ?? r.what_happened ?? r.note ?? r.today_action)), 6),
    assumptions: unique([project.problem ? `Target users have this problem: ${project.problem}` : null, project.target_users ? `Target segment: ${project.target_users}` : null], 6),
    risks: signals.filter((s) => ["EVIDENCE_GAP", "GOAL_SLIPPAGE", "ASSUMPTION_DECAY", "BUSYWORK_PATTERN"].includes(s.type)).map((s) => s.summary).slice(0, 6),
    metrics: {
      momentum_score: founderContext.momentum_score ?? null,
      current_mrr: project.current_mrr ?? null,
      tasks_completed_this_week: completedThisWeek.length,
      reflected_actions_this_week: thisWeek.length,
    },
    strategic_priorities: statedPriorities,
    recent_changes: temporal.week_changes.slice(0, 5),
  };

  const strategy: StrategyState = {
    stated_priorities: statedPriorities,
    observed_priorities: observedPriorities,
    contradictions: contradictionSignals.map((s) => s.summary),
    strategic_drift: signals.filter((s) => s.type === "BUSYWORK_PATTERN" || s.type === "GOAL_SLIPPAGE").map((s) => s.summary),
    priority_confidence: clampScore((activeMilestones.length ? 40 : 20) + (project.problem ? 20 : 0) + (thisWeek.length ? 20 : 0)),
  };

  const repeatedActions = unique(reflections.map((r) => String(r.today_action ?? "")).filter((title, _, arr) => title && arr.filter((x) => x === title).length > 1), 5);
  const execution: ExecutionState = {
    completed_actions: completedThisWeek.map((r) => String(r.today_action ?? r.note ?? "completed action")).slice(0, 6),
    skipped_actions: skippedThisWeek.map((r) => String(r.today_action ?? r.note ?? "skipped action")).slice(0, 6),
    delayed_actions: tasks.filter((t) => !t.is_completed && t.status !== "completed" && daysBetween(now, t.updated_at ?? t.created_at ?? t.due_date) >= 7).map((t) => String(t.title)).slice(0, 6),
    repeated_actions: repeatedActions,
    outcome_quality: startup.evidence.length ? [`${startup.evidence.length} evidence-producing reflections detected.`] : ["Recent completion does not clearly show external evidence yet."],
    execution_velocity: thisWeek.length ? Math.round((completedThisWeek.length / thisWeek.length) * 100) : 0,
  };

  const stateWithoutDecision = {
    founder,
    startup,
    strategy,
    execution,
    temporal,
    signals,
    archetype_stats: computeArchetypeStats(learningLogs),
    source_summary: {
      reflections: reflections.length,
      learning_logs: learningLogs.length,
      activity_events: activityEvents.length,
      milestones: milestones.length,
      tasks: tasks.length,
      action_logs: actionLogs.length,
    },
    generated_at: now.toISOString(),
  };

  const todayDateStr = now.toISOString().slice(0, 10);
  const hasFreshCache = !input.excludeAction && input.cachedDecision?.date === todayDateStr;
  const decision = hasFreshCache
    ? input.cachedDecision!.decision
    : buildDecisionState({ ...stateWithoutDecision, decision: { candidates: [], top_candidate: null, decision_basis: [] } }, input.excludeAction);

  return { ...stateWithoutDecision, decision };
}

// Same success/failure definition as getCandidateArchetypeStats() in
// lib/learningLoop.ts, kept independent (not imported) since that function
// hits the DB and this one works off rows FounderIntelligenceInput already
// fetched — but the two must never quietly disagree about what counts as a
// win, so: outcome === "completed" AND evidence_match_score >= 0.5.
function computeArchetypeStats(learningLogs: LearningLogRow[]): Record<string, { successes: number; failures: number }> {
  const stats: Record<string, { successes: number; failures: number }> = {};
  for (const row of learningLogs as Array<LearningLogRow & { candidate_id?: string | null; prediction_source?: string | null; evidence_match_score?: number | null }>) {
    if (row.prediction_source !== "founder_intelligence") continue;
    const id = row.candidate_id;
    if (!id || row.outcome === "pending") continue;
    if (!stats[id]) stats[id] = { successes: 0, failures: 0 };
    const success = row.outcome === "completed" && (row.evidence_match_score ?? 0) >= 0.5;
    if (success) stats[id].successes += 1;
    else stats[id].failures += 1;
  }
  return stats;
}

// ── Thompson Sampling primitives ────────────────────────────────────────
// Self-contained — no stats library needed. Standard textbook methods:
// Box-Muller for a normal draw, Marsaglia-Tsang for Gamma, Gamma ratio for
// Beta. Used to sample from each archetype's Beta(successes+1, failures+1)
// posterior at ranking time, rather than ranking by the raw success rate —
// sampling (not the mean) is what gives bandits their explore/exploit
// balance: an archetype with 1 success and 0 failures still occasionally
// loses to one with 20/20, because its posterior is wide, not because it's
// being penalized.
function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleGamma(shape: number): number {
  if (shape < 1) {
    const u = Math.random();
    return sampleGamma(shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 100; i++) {
    let x: number, v: number;
    do {
      x = gaussianRandom();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
  return d; // fallback — practically unreachable, keeps this total
}

function sampleBeta(alpha: number, beta: number): number {
  const x = sampleGamma(alpha);
  const y = sampleGamma(beta);
  return x / (x + y);
}

// ── Recency decay ────────────────────────────────────────────────────────
// A signal detected once (e.g. REPEATED_AVOIDANCE on day 3) previously kept
// its full confidence forever unless re-detected — so a pattern from three
// weeks ago could still be gating candidate selection and inflating a
// candidate's confidence score today, long after it stopped being true.
// This applies the same shape of fix already proven for momentum (bounded
// EMA instead of an unbounded accumulator) to every signal type: exponential
// half-life decay from detected_at, evaluated against state.generated_at
// (not wall-clock "now" — keeps this deterministic and testable against a
// fixed state snapshot). A signal with an explicit expires_at decays fully
// by that date regardless of the default half-life.
const SIGNAL_HALF_LIFE_DAYS = 10;
const SIGNAL_ACTIVE_THRESHOLD = 0.3;

function decayedSignalConfidence(signal: IntelligenceSignal, asOf: Date): number {
  const detected = new Date(signal.detected_at).getTime();
  if (!Number.isFinite(detected)) return signal.confidence;
  const daysSince = Math.max(0, (asOf.getTime() - detected) / 86_400_000);
  if (signal.expires_at) {
    const expires = new Date(signal.expires_at).getTime();
    if (Number.isFinite(expires)) {
      const totalSpan = Math.max(1, (expires - detected) / 86_400_000);
      return Math.max(0, signal.confidence * (1 - daysSince / totalSpan));
    }
  }
  return signal.confidence * Math.exp(-Math.LN2 * (daysSince / SIGNAL_HALF_LIFE_DAYS));
}

/**
 * Signals sorted by decayed confidence (freshest/strongest first) with
 * anything that's decayed below SIGNAL_ACTIVE_THRESHOLD dropped entirely.
 * This is what buildDecisionState's gating checks and scoreCandidate's
 * confidence calc should read instead of the raw state.signals array — a
 * signal that's aged out shouldn't gate a candidate into existence or prop
 * up its confidence score just because it was true once.
 */
function activeSignals(signals: IntelligenceSignal[], asOf: Date): Array<IntelligenceSignal & { decayed_confidence: number }> {
  return signals
    .map((s) => ({ ...s, decayed_confidence: decayedSignalConfidence(s, asOf) }))
    .filter((s) => s.decayed_confidence >= SIGNAL_ACTIVE_THRESHOLD)
    .sort((a, b) => b.decayed_confidence - a.decayed_confidence);
}

function scoreCandidate(candidate: Omit<DecisionCandidate, "scores" | "why_it_beats_alternatives">, state: FounderIntelligenceState): DecisionCandidate {
  const signalTypes = new Set(candidate.supporting_signals);
  const isExternal = /user|customer|interview|feedback|message|call|revenue|pricing|paid|launch|post|publish/i.test(candidate.action);
  const hasAvoidance = signalTypes.has("REPEATED_AVOIDANCE") || signalTypes.has("RECOMMENDATION_REJECTION_PATTERN");
  const hasGoalRisk = signalTypes.has("GOAL_SLIPPAGE");
  const hasEvidenceGap = signalTypes.has("EVIDENCE_GAP") || signalTypes.has("ASSUMPTION_DECAY");
  const repeated = state.execution.repeated_actions.some((a) => a && candidate.action.toLowerCase().includes(a.toLowerCase().slice(0, 24)));
  const founderAvoidsExternal = state.founder.avoidance_patterns.some((p) => /outreach|interview|customer|sales|pricing|revenue/i.test(p));
  const isGenericContinuation = candidate.id === "continue_best_next_task";
  const impact = isGenericContinuation ? 55 : hasEvidenceGap || hasGoalRisk ? 90 : isExternal ? 75 : 55;
  const urgency = isGenericContinuation ? 45 : signalTypes.has("EVIDENCE_GAP") || signalTypes.has("GOAL_SLIPPAGE") ? 90 : signalTypes.has("MOMENTUM_CHANGE") ? 70 : 55;
  const goal_relevance = isGenericContinuation ? 60 : candidate.action.toLowerCase().includes(String(state.startup.current_goal ?? "").toLowerCase().slice(0, 12)) ? 85 : hasGoalRisk ? 80 : 60;
  const evidence_value = isGenericContinuation ? 45 : isExternal ? 90 : hasEvidenceGap ? 75 : 45;
  const founder_fit = hasAvoidance ? 55 : founderAvoidsExternal && isExternal ? 50 : 75;
  const execution_probability = state.execution.execution_velocity > 70 ? 80 : state.execution.execution_velocity > 40 ? 65 : 45;
  const opportunity_cost = isExternal ? 15 : 35;
  const repetition_penalty = repeated ? 40 : 0;
  const behavioral_correction = isGenericContinuation ? 40 : hasAvoidance || signalTypes.has("BEHAVIOR_STRATEGY_CONTRADICTION") ? 80 : 45;
  const risk_reduction = isGenericContinuation ? 50 : hasGoalRisk || hasEvidenceGap || signalTypes.has("ASSUMPTION_DECAY") ? 85 : 55;
  const asOf = new Date(state.generated_at);
  const confidence = Math.round(candidate.supporting_signals.reduce((sum, type) => {
    const signal = state.signals.find((s) => s.type === type);
    return sum + (signal ? decayedSignalConfidence(signal, asOf) : 0.5);
  }, 0) / Math.max(1, candidate.supporting_signals.length) * 100);
  // Thompson Sampling: sample this archetype's Beta(successes+1, failures+1)
  // posterior for THIS founder. A new founder or archetype with no resolved
  // history yet samples Beta(1,1) — uniform, so it contributes ~50 on
  // average and doesn't bias ranking either way. As real outcomes accumulate
  // for this founder specifically, an archetype that's actually produced
  // evidence for them pulls its own ranking up over time; one that hasn't
  // pulls down — without any hand-tuned per-founder weight anywhere.
  const archetypeHistory = state.archetype_stats[candidate.id];
  const learned_fit = Math.round(sampleBeta((archetypeHistory?.successes ?? 0) + 1, (archetypeHistory?.failures ?? 0) + 1) * 100);
  const total = clampScore(
    impact * 0.16 + urgency * 0.14 + goal_relevance * 0.13 + evidence_value * 0.15 + founder_fit * 0.1 + execution_probability * 0.1 + behavioral_correction * 0.1 + risk_reduction * 0.1 + confidence * 0.08 + learned_fit * 0.12 - opportunity_cost * 0.08 - repetition_penalty * 0.08,
  );
  return {
    ...candidate,
    scores: { impact, urgency, goal_relevance, evidence_value, founder_fit, execution_probability, opportunity_cost, repetition_penalty, behavioral_correction, risk_reduction, confidence, total },
    why_it_beats_alternatives: `Scores highest because it balances ${hasEvidenceGap ? "fresh evidence" : hasGoalRisk ? "goal recovery" : "execution progress"} with founder fit${archetypeHistory ? ", and this approach has worked for you before" : ""} and avoids repeating stale work.`,
  };
}

// Rotating platform pool for candidate templates. Kept in sync with the
// has_platform regex in lib/aiEvaluator.ts ACTION_CHECKS — if that list
// changes, this should change with it. Picking by a stable hash of the
// current goal (rather than always the first option) means two founders
// with different goals don't get the same channel every time, and the
// same founder doesn't get the same channel every day for a repeating signal.
const OUTREACH_PLATFORMS = ["WhatsApp", "LinkedIn", "email", "Twitter"] as const;
function pickPlatform(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return OUTREACH_PLATFORMS[hash % OUTREACH_PLATFORMS.length];
}

export function buildDecisionState(state: FounderIntelligenceState, excludeAction?: string): DecisionState {
  const candidates: Array<Omit<DecisionCandidate, "scores" | "why_it_beats_alternatives">> = [];
  const currentGoal = state.startup.current_goal ?? "the current startup goal";
  const target = state.startup.assumptions.find((a) => a.toLowerCase().includes("target segment"))?.replace(/^Target segment: /, "") || "target users";
  // Decay-filtered: a signal detected once no longer gates candidate
  // selection forever — see decayedSignalConfidence() above.
  const live = activeSignals(state.signals, new Date(state.generated_at));
  const topSignals = live.slice(0, 5);

  if (live.some((s) => s.type === "EVIDENCE_GAP" || s.type === "ASSUMPTION_DECAY")) {
    const platform = pickPlatform(`evidence_probe:${currentGoal}`);
    candidates.push({
      id: "evidence_probe",
      action: `Message 3 ${target} on ${platform} for ${currentGoal}: ask what they did the last time this problem appeared.`,
      rationale: "Fresh evidence is the bottleneck; more internal work will not reduce assumption risk.",
      expected_evidence: "A concrete user/customer response, objection, workflow detail, or commitment signal.",
      supporting_signals: topSignals.filter((s) => s.type === "EVIDENCE_GAP" || s.type === "ASSUMPTION_DECAY" || s.type === "BUSYWORK_PATTERN").map((s) => s.type),
    });
  }

  if (live.some((s) => s.type === "GOAL_SLIPPAGE")) {
    candidates.push({
      id: "unstall_goal",
      action: `Unstall ${currentGoal}: finish 1 concrete subtask today and log the specific before/after result — no planning, only a completed artifact.`,
      rationale: "The active goal is aging; the next move should make progress observable rather than broad.",
      expected_evidence: "A task completion plus a specific before/after or user/revenue/learning artifact.",
      supporting_signals: topSignals.filter((s) => s.type === "GOAL_SLIPPAGE" || s.type === "MOMENTUM_CHANGE").map((s) => s.type),
    });
  }

  if (live.some((s) => s.type === "REPEATED_AVOIDANCE" || s.type === "BEHAVIOR_STRATEGY_CONTRADICTION" || s.type === "RECOMMENDATION_REJECTION_PATTERN")) {
    const avoid = state.founder.avoidance_patterns[0] ?? "the avoided work";
    const platform = pickPlatform(`avoidance_microdose:${avoid}`);
    candidates.push({
      id: "avoidance_microdose",
      action: `Spend 15 minutes on ${avoid} today: send 1 message on ${platform} that advances ${currentGoal} without letting avoidance pick the agenda.`,
      rationale: "The behavioral pattern is now part of the startup bottleneck, not a side issue.",
      expected_evidence: "Whether a smaller version of the avoided action gets started or still gets resisted.",
      supporting_signals: topSignals.filter((s) => s.type === "REPEATED_AVOIDANCE" || s.type === "BEHAVIOR_STRATEGY_CONTRADICTION" || s.type === "RECOMMENDATION_REJECTION_PATTERN").map((s) => s.type),
    });
  }

  candidates.push({
    id: "continue_best_next_task",
    action: `Advance ${currentGoal}: complete 1 highest-priority open task today and name one observable result before calling it done.`,
    rationale: "When signals are mixed, preserve strategic continuity and improve outcome quality.",
    expected_evidence: "A completed task with a named result, blocker, or learning artifact.",
    supporting_signals: topSignals.map((s) => s.type),
  });

  const ranked = candidates
    .filter((candidate) => {
      // FIX (task-repeat bug): drop the candidate template whose generated
      // text matches what the founder just rejected. "continue_best_next_task"
      // has no signal gate and is always pushed above, so there's always at
      // least one remaining candidate to rank even if the excluded one was
      // the only signal-gated one active right now.
      if (!excludeAction) return true;
      return candidate.action.trim().toLowerCase() !== excludeAction.trim().toLowerCase();
    })
    .map((candidate) => scoreCandidate({ ...candidate, supporting_signals: unique(candidate.supporting_signals, 5) as IntelligenceSignalType[] }, state))
    .sort((a, b) => b.scores.total - a.scores.total)
    .slice(0, 4);

  return {
    candidates: ranked,
    top_candidate: ranked[0] ?? null,
    decision_basis: [
      ranked[0] ? `Top candidate score: ${ranked[0].scores.total}/100.` : "No candidate ranked.",
      ...topSignals.slice(0, 3).map((s) => `${s.type}: ${s.summary}`),
    ],
  };
}

export function buildFounderIntelligencePromptBlock(state: FounderIntelligenceState): string {
  const topSignals = activeSignals(state.signals, new Date(state.generated_at)).slice(0, 5);
  const candidate = state.decision.top_candidate;
  const lines: string[] = [
    "FOUNDER INTELLIGENCE OS STATE (structured, deterministic signals — treat as factual state, not prose decoration):",
    `Current goal: ${state.startup.current_goal ?? "unknown"}`,
    `Founder strengths: ${state.founder.strengths.join(", ") || "not enough evidence"}`,
    `Founder avoidance: ${state.founder.avoidance_patterns.join(", ") || "not enough evidence"}`,
    `Observed priorities: ${state.strategy.observed_priorities.join(", ") || "none observed this week"}`,
    `Stated priorities: ${state.strategy.stated_priorities.join(", ") || "unknown"}`,
  ];
  if (state.temporal.week_changes.length) {
    lines.push(`Recent change: ${state.temporal.week_changes.slice(0, 2).join(" ")}`);
  }
  if (topSignals.length) {
    lines.push("Top machine-readable signals (confidence shown is recency-decayed, not the original detection confidence):");
    for (const s of topSignals) {
      lines.push(`- ${s.type} [${s.severity}, ${Math.round(s.decayed_confidence * 100)}%]: ${s.summary} Recommended response: ${s.recommended_response}`);
    }
  }
  if (candidate) {
    lines.push("Deterministic top candidate before LLM refinement:");
    lines.push(`- Action: ${candidate.action}`);
    lines.push(`- Score: ${candidate.scores.total}/100; why it beats alternatives: ${candidate.why_it_beats_alternatives}`);
    lines.push(`- Expected evidence: ${candidate.expected_evidence}`);
  }
  lines.push("INSTRUCTION: Use the top candidate and signals as the decision basis unless the user's fresh context clearly contradicts them. If changing the action, explain which signal changed the ranking.");
  lines.push("SCHEMA REQUIREMENT (non-negotiable, overrides candidate wording if they conflict): the final TASK line must name a specific number and a specific platform or channel (WhatsApp, LinkedIn, email, Twitter, phone, in person, Slack, etc). If the top candidate's action is abstract or missing either, do NOT copy its phrasing — keep its intent but make it concrete.");
  return lines.join("\n");
}

export function summarizeFounderIntelligenceForClient(state: FounderIntelligenceState) {
  const cofounderJudgment = buildCofounderJudgment(state);
  return {
    generated_at: state.generated_at,
    current_goal: state.startup.current_goal,
    top_signals: state.signals.slice(0, 4).map((s) => ({
      type: s.type,
      severity: s.severity,
      confidence: s.confidence,
      title: s.title,
      summary: s.summary,
      evidence: s.evidence.slice(0, 3),
      recommended_response: s.recommended_response,
    })),
    what_changed: state.temporal.week_changes.slice(0, 3),
    founder_model: {
      strengths: state.founder.strengths.slice(0, 5),
      avoidance_patterns: state.founder.avoidance_patterns.slice(0, 5),
      operating_windows: state.founder.operating_windows.slice(0, 3),
      confidence: state.founder.confidence,
      corrections: state.founder.corrections,
    },
    strategy: {
      stated_priorities: state.strategy.stated_priorities.slice(0, 4),
      observed_priorities: state.strategy.observed_priorities.slice(0, 4),
      contradictions: state.strategy.contradictions.slice(0, 3),
    },
    decision: {
      top_candidate: state.decision.top_candidate,
      alternatives: state.decision.candidates.slice(1, 4),
      basis: state.decision.decision_basis,
    },
    cofounder_judgment: cofounderJudgment,
    source_summary: state.source_summary,
  };
}

export async function loadFounderIntelligence(
  supabase: SupabaseLike,
  userId: string,
  projectId?: string,
  preloaded: Partial<FounderIntelligenceInput> = {},
): Promise<FounderIntelligenceState> {
  const now = preloaded.now ?? new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 86_400_000).toISOString();

  try {
    const [contextRes, memoryRes, projectRes, milestonesRes, tasksRes, reflectionsRes, learningRes, activityRes, actionLogsRes] = await Promise.allSettled([
      preloaded.founderContext !== undefined ? Promise.resolve({ data: preloaded.founderContext }) : supabase.from("founder_context").select("*").eq("user_id", userId).maybeSingle(),
      preloaded.founderMemory !== undefined ? Promise.resolve({ data: preloaded.founderMemory }) : supabase.from("founder_memory").select("*").eq("user_id", userId).maybeSingle(),
      preloaded.project !== undefined ? Promise.resolve({ data: preloaded.project }) : projectId ? supabase.from("projects").select("*").eq("id", projectId).eq("user_id", userId).maybeSingle() : Promise.resolve({ data: null }),
      preloaded.milestones !== undefined ? Promise.resolve({ data: preloaded.milestones }) : projectId ? supabase.from("milestones").select("*").eq("project_id", projectId).eq("user_id", userId).order("created_at", { ascending: true }).limit(20) : Promise.resolve({ data: [] }),
      preloaded.tasks !== undefined ? Promise.resolve({ data: preloaded.tasks }) : supabase.from("tasks").select("*").eq("user_id", userId).order("updated_at", { ascending: false }).limit(80),
      // CROSS-PROJECT CONTAMINATION FIX: previously filtered only by
      // user_id — a founder with multiple projects (or a Break My Startup
      // run on an unrelated custom idea) had every other project's
      // reflections/tasks/action-outcomes pulled into this project's
      // signal derivation. Same bug class as todayPersonalisationContext.ts
      // (fixed earlier), reintroduced here independently since this module
      // queries the same tables from scratch. `.or(project_id.eq.X,
      // project_id.is.null)` keeps legacy rows written before project_id
      // existed on these tables, while excluding rows known to belong to a
      // specific *other* project. Only applied when projectId is known —
      // falls back to unscoped (same as before) for idea-only contexts.
      preloaded.reflections !== undefined
        ? Promise.resolve({ data: preloaded.reflections })
        : (projectId
            ? supabase.from("reflections").select("*").eq("user_id", userId).or(`project_id.eq.${projectId},project_id.is.null`).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(80)
            : supabase.from("reflections").select("*").eq("user_id", userId).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(80)),
      preloaded.learningLogs !== undefined
        ? Promise.resolve({ data: preloaded.learningLogs })
        : (projectId
            ? supabase.from("reflexion_learning_log").select("*").eq("user_id", userId).or(`project_id.eq.${projectId},project_id.is.null`).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(50)
            : supabase.from("reflexion_learning_log").select("*").eq("user_id", userId).gte("created_at", thirtyDaysAgo).order("created_at", { ascending: false }).limit(50)),
      preloaded.activityEvents !== undefined ? Promise.resolve({ data: preloaded.activityEvents }) : supabase.from("activity_log").select("event_type, occurred_at, metadata").eq("user_id", userId).gte("occurred_at", thirtyDaysAgo).order("occurred_at", { ascending: false }).limit(500),
      preloaded.actionLogs !== undefined
        ? Promise.resolve({ data: preloaded.actionLogs })
        : (projectId
            ? supabase.from("action_logs").select("*").eq("user_id", userId).or(`project_id.eq.${projectId},project_id.is.null`).gte("created_at", fourteenDaysAgo).order("created_at", { ascending: false }).limit(80)
            : supabase.from("action_logs").select("*").eq("user_id", userId).gte("created_at", fourteenDaysAgo).order("created_at", { ascending: false }).limit(80)),
    ]);

    const data = <T>(res: PromiseSettledResult<{ data: T }>, fallback: T): T => res.status === "fulfilled" ? (res.value.data ?? fallback) : fallback;

    const founderContextRow = data(contextRes as PromiseSettledResult<{ data: Record<string, any> | null }>, null);
    const todayDateStr = now.toISOString().slice(0, 10);
    const cachedDecisionRaw = founderContextRow?.decision_cache;
    const cachedDecisionDate = founderContextRow?.decision_cache_date;
    // One decision authority: only treated as usable if it's dated today.
    // A cache from yesterday (or earlier) is stale — new day, new sample.
    const cachedDecision = cachedDecisionRaw && cachedDecisionDate
      ? { decision: cachedDecisionRaw as DecisionState, date: String(cachedDecisionDate).slice(0, 10) }
      : null;

    const result = buildFounderIntelligenceState({
      founderContext: founderContextRow,
      founderMemory: data(memoryRes as PromiseSettledResult<{ data: Record<string, any> | null }>, null),
      project: data(projectRes as PromiseSettledResult<{ data: Record<string, any> | null }>, null),
      milestones: data(milestonesRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
      tasks: data(tasksRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
      reflections: data(reflectionsRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
      learningLogs: data(learningRes as PromiseSettledResult<{ data: LearningLogRow[] }>, []),
      activityEvents: data(activityRes as PromiseSettledResult<{ data: SessionEvent[] }>, []),
      actionLogs: data(actionLogsRes as PromiseSettledResult<{ data: Array<Record<string, any>> }>, []),
      now,
      excludeAction: preloaded.excludeAction,
      cachedDecision,
    });

    // Cache miss (no same-day cache, or excludeAction forced a fresh
    // compute) — write the newly-sampled decision back so the NEXT caller
    // today (Today's own retry, Coach, any other surface) reads this same
    // committed decision instead of drawing its own sample. Fire-and-forget:
    // never adds latency to the response this decision is already part of.
    const wasFreshCompute = preloaded.excludeAction || cachedDecision?.date !== todayDateStr;
    if (wasFreshCompute) {
      Promise.resolve(
        supabase.from("founder_context").update({
          decision_cache: result.decision,
          decision_cache_date: todayDateStr,
        }).eq("user_id", userId),
      ).catch(() => {});
    }

    return result;
  } catch (err) {
    logError("founderIntelligence/loadFounderIntelligence", err, { userId, projectId });
    return buildFounderIntelligenceState({ ...preloaded, now });
  }
}
