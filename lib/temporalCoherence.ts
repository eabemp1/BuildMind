/**
 * lib/temporalCoherence.ts
 *
 * Reusable deterministic temporal comparison for Founder Intelligence.
 * Answers what changed today, this week, compared with the previous week,
 * and since the previous recommendation decision.
 */

type Row = Record<string, any>;

export interface TemporalComparisonInput {
  now?: Date;
  reflections?: Row[];
  learningLogs?: Row[];
  milestones?: Row[];
  tasks?: Row[];
  activityEvents?: Row[];
}

export interface TemporalComparison {
  changed_today: string[];
  changed_this_week: string[];
  week_over_week: string[];
  since_last_decision: string[];
  increasing: string[];
  decreasing: string[];
  recommendation_effectiveness: {
    recent_completion_rate: number | null;
    previous_completion_rate: number | null;
    trend: "up" | "down" | "flat" | "unknown";
  };
  slipping_goals: string[];
  decaying_assumptions: string[];
}

const EXTERNAL_KEYWORDS = /\b(user|customer|interview|feedback|talked|called|met|spoke|revenue|sale|paid|pricing|launch|publish|post|pitch|email|reach out|dm|contact)\b/i;

function dateValue(row: Row, fallback = "created_at"): number {
  const raw = row[fallback] ?? row.created_at ?? row.occurred_at ?? row.updated_at ?? row.outcome_recorded_at;
  const t = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function daysBetween(now: Date, row: Row, field = "created_at"): number {
  const t = dateValue(row, field);
  if (!t) return 999;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

function within(rows: Row[], now: Date, minDays: number, maxDays: number, field = "created_at"): Row[] {
  return rows.filter((row) => {
    const age = daysBetween(now, row, field);
    return age >= minDays && age < maxDays;
  });
}

function completionRate(rows: Row[]): number | null {
  const resolved = rows.filter((r) => ["completed", "done", "partial", "overridden", "ignored", "blocked", "skipped"].includes(String(r.outcome)));
  if (!resolved.length) return null;
  const completed = resolved.filter((r) => r.outcome === "completed" || r.outcome === "done").length;
  return Math.round((completed / resolved.length) * 100) / 100;
}

function trend(nowRate: number | null, prevRate: number | null): "up" | "down" | "flat" | "unknown" {
  if (nowRate == null || prevRate == null) return "unknown";
  if (nowRate > prevRate + 0.1) return "up";
  if (nowRate < prevRate - 0.1) return "down";
  return "flat";
}

function externalCount(rows: Row[]): number {
  return rows.filter((r) => EXTERNAL_KEYWORDS.test(`${r.today_action ?? ""} ${r.note ?? ""} ${r.what_happened ?? ""} ${r.what_learned ?? ""}`)).length;
}

export function buildTemporalComparison(input: TemporalComparisonInput): TemporalComparison {
  const now = input.now ?? new Date();
  const reflections = input.reflections ?? [];
  const learningLogs = input.learningLogs ?? [];
  const milestones = input.milestones ?? [];
  const tasks = input.tasks ?? [];
  const activityEvents = input.activityEvents ?? [];

  const todayReflections = within(reflections, now, 0, 1);
  const todayActivity = within(activityEvents, now, 0, 1, "occurred_at");
  const thisWeekReflections = within(reflections, now, 0, 7);
  const prevWeekReflections = within(reflections, now, 7, 14);
  const thisWeekLogs = within(learningLogs, now, 0, 7);
  const prevWeekLogs = within(learningLogs, now, 7, 14);
  const lastDecision = learningLogs
    .filter((r) => r.action_shown)
    .sort((a, b) => dateValue(b) - dateValue(a))[0];
  const sinceLastDecision = lastDecision
    ? [...reflections, ...activityEvents].filter((row) => dateValue(row) > dateValue(lastDecision))
    : [];

  const thisWeekExternal = externalCount(thisWeekReflections);
  const prevWeekExternal = externalCount(prevWeekReflections);
  const recentCompletion = completionRate(thisWeekLogs.length ? thisWeekLogs : thisWeekReflections);
  const previousCompletion = completionRate(prevWeekLogs.length ? prevWeekLogs : prevWeekReflections);
  const effectivenessTrend = trend(recentCompletion, previousCompletion);

  const activeMilestones = milestones.filter((m) => m.status !== "completed" && m.status !== "abandoned");
  const slippingGoals = activeMilestones
    .filter((m) => daysBetween(now, m, "updated_at") >= 7)
    .map((m) => String(m.title ?? "Untitled milestone"))
    .slice(0, 5);

  const staleTasks = tasks
    .filter((t) => !t.is_completed && t.status !== "completed" && daysBetween(now, t, "updated_at") >= 14)
    .map((t) => String(t.title ?? "Untitled task"))
    .slice(0, 5);

  return {
    changed_today: [
      todayReflections.length ? `${todayReflections.length} reflection event(s) recorded today.` : null,
      todayActivity.length ? `${todayActivity.length} activity event(s) recorded today.` : null,
    ].filter(Boolean) as string[],
    changed_this_week: [
      `${thisWeekReflections.filter((r) => r.outcome === "completed" || r.outcome === "done").length}/${thisWeekReflections.length} reflected actions completed this week.`,
      `${thisWeekExternal} external evidence action(s) this week.`,
      thisWeekLogs.length ? `${thisWeekLogs.length} recommendation lifecycle event(s) this week.` : null,
    ].filter(Boolean) as string[],
    week_over_week: [
      `External evidence actions moved from ${prevWeekExternal} last week to ${thisWeekExternal} this week.`,
      recentCompletion != null && previousCompletion != null ? `Recommendation completion moved from ${Math.round(previousCompletion * 100)}% to ${Math.round(recentCompletion * 100)}%.` : null,
    ].filter(Boolean) as string[],
    since_last_decision: lastDecision
      ? [`${sinceLastDecision.length} event(s) recorded since the last recommendation: "${String(lastDecision.action_shown).slice(0, 120)}".`]
      : [],
    increasing: [
      thisWeekExternal > prevWeekExternal ? "external evidence seeking" : null,
      effectivenessTrend === "up" ? "recommendation follow-through" : null,
    ].filter(Boolean) as string[],
    decreasing: [
      thisWeekExternal < prevWeekExternal ? "external evidence seeking" : null,
      effectivenessTrend === "down" ? "recommendation follow-through" : null,
    ].filter(Boolean) as string[],
    recommendation_effectiveness: {
      recent_completion_rate: recentCompletion,
      previous_completion_rate: previousCompletion,
      trend: effectivenessTrend,
    },
    slipping_goals: slippingGoals,
    decaying_assumptions: staleTasks,
  };
}
