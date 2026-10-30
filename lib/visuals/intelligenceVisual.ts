/**
 * lib/visuals/intelligenceVisual.ts
 *
 * Pure builders: real founder data in, VisualSpec out. Nothing here invents a
 * number or asks a model to write anything. Every panel is a reshaping of a
 * field that already exists in the Founder Intelligence state, the scorecard,
 * the milestone view or the execution log, so a drawn picture can never claim
 * more than the underlying record does. Panels with no data are left out
 * rather than padded.
 */

import type { FounderIntelligenceState } from "@/lib/founderIntelligence";
import type { FounderScorecard } from "@/lib/scorecard";
import type { MilestoneProgress } from "@/lib/coachActions/backlog";
import type { ExecutionLogView } from "@/lib/coachActions/executionLog";
import { toneForScore, type VisualPanel, type VisualSpec, type VisualTone } from "./spec";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const title = (s: string) => s.replace(/[_-]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const SEV_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export interface TrendPoint { recordedAt: string; daysInactive: number; engagement?: string }
export interface AccuracyLike { sample_size: number; average_match_score: number; trend?: string }

export function buildExecutionIntelligenceVisual(input: {
  state: FounderIntelligenceState;
  trend?: TrendPoint[];
  accuracy?: AccuracyLike | null;
  generatedAt?: string;
}): VisualSpec {
  const { state } = input;
  const ex = state.execution_state.execution;
  const mom = state.execution_state.momentum;
  const panels: VisualPanel[] = [];

  const activeSignals = state.signals.filter((s) => s.lifecycle === "active");
  const high = activeSignals.filter((s) => (SEV_RANK[s.severity] ?? 0) >= 3).length;

  // 1. Headline numbers
  const stats: Extract<VisualPanel, { type: "stats" }>["items"] = [];
  if (typeof mom.score === "number") {
    const arrow = mom.trend === "up" ? "up" : mom.trend === "down" ? "down" : "";
    stats.push({ label: "Momentum", value: String(Math.round(mom.score)), sub: mom.delta != null ? `${mom.delta > 0 ? "+" : ""}${Math.round(mom.delta)} vs last week${arrow ? ` (${arrow})` : ""}` : "no week-ago baseline", tone: toneForScore(mom.score) });
  }
  stats.push({ label: "Actions done, 7 days", value: String(ex.completed_actions_7d), tone: ex.completed_actions_7d >= 3 ? "good" : ex.completed_actions_7d >= 1 ? "warn" : "bad" });
  if (ex.task_velocity_7d != null) stats.push({ label: "Tasks per active day", value: String(Math.round(ex.task_velocity_7d * 10) / 10), sub: "last 7 days" });
  stats.push({ label: "Postponed repeatedly", value: String(ex.repeated_postponements), tone: ex.repeated_postponements >= 3 ? "bad" : ex.repeated_postponements >= 1 ? "warn" : "good" });
  stats.push({ label: "Active signals", value: String(activeSignals.length), sub: high ? `${high} high severity` : "none high severity", tone: high ? "bad" : "good" });
  panels.push({ type: "stats", title: "Where you stand", items: stats });

  // 2. Gauges
  if (typeof mom.score === "number") panels.push({ type: "gauge", title: "Momentum", value: mom.score, label: "of 100", caption: "Your smoothed daily momentum, the same number shown on Today." });
  panels.push({ type: "gauge", title: "Completion rate this week", value: state.execution.execution_velocity, label: "% of started work finished", caption: `${state.execution.completed_actions.length} completed, ${state.execution.skipped_actions.length} skipped, ${state.execution.delayed_actions.length} delayed.` });
  if (input.accuracy && input.accuracy.sample_size > 0) {
    panels.push({ type: "gauge", title: "How often BuildMind was right", value: Math.round(input.accuracy.average_match_score * 100), label: `from ${input.accuracy.sample_size} checked recommendations`, caption: "Match between what was recommended and what you actually did." });
  }
  if (state.founder.confidence > 0) panels.push({ type: "gauge", title: "How well BuildMind knows you", value: Math.round(state.founder.confidence * 100), label: "profile confidence", caption: "Grows as you complete, skip and reflect on actions." });

  // 3. Trend
  if (input.trend && input.trend.length >= 2) {
    panels.push({
      type: "line", title: "Days since last activity, last 30 days", unit: "d", min: 0,
      caption: "Lower is better. Spikes are the stretches where work stopped.",
      points: input.trend.map((t) => ({ label: t.recordedAt.slice(5, 10), value: t.daysInactive })),
    });
  }

  // 4. Where effort goes
  if (ex.focus_distribution.length) {
    const top = [...ex.focus_distribution].sort((a, b) => b.count - a.count).slice(0, 7);
    const max = Math.max(...top.map((t) => t.count), 1);
    panels.push({ type: "bars", title: "Where your finished work goes", caption: "Completed actions by kind of work.", items: top.map((t) => ({ label: title(t.category), value: t.count, max, tone: "accent" as VisualTone })) });
  }

  // 5. How you operate
  const op: Extract<VisualPanel, { type: "tree" }>["branches"] = [];
  if (state.founder.strengths.length) op.push({ label: "Strengths", tone: "good", children: state.founder.strengths.slice(0, 4).map((s) => ({ label: clip(s, 90) })) });
  if (state.founder.avoidance_patterns.length) op.push({ label: "What you tend to avoid", tone: "bad", children: state.founder.avoidance_patterns.slice(0, 4).map((s) => ({ label: clip(s, 90) })) });
  if (state.founder.mixed_patterns?.length) op.push({ label: "Could be either (not clear yet)", tone: "warn", children: state.founder.mixed_patterns.slice(0, 3).map((s) => ({ label: clip(s, 90) })) });
  if (state.founder.operating_windows.length) op.push({ label: "When you work best", tone: "accent", children: state.founder.operating_windows.slice(0, 3).map((s) => ({ label: clip(s, 90) })) });
  if (op.length) panels.push({ type: "tree", title: "How you operate", caption: "Inferred from what you logged, not from a quiz.", root: "You", branches: op });

  // 6. Signals
  if (activeSignals.length) {
    const sorted = [...activeSignals].sort((a, b) => (SEV_RANK[b.severity] ?? 0) - (SEV_RANK[a.severity] ?? 0) || b.confidence - a.confidence).slice(0, 6);
    panels.push({ type: "signals", title: "What BuildMind is seeing", caption: "Each signal is built from logged behaviour and fades if the pattern stops.", items: sorted.map((s) => ({ label: s.title, severity: s.severity, confidence: s.confidence, note: clip(s.summary, 140) })) });
  }

  // 7. Why today's pick won
  const top = state.decision.top_candidate;
  if (top) {
    const s = top.scores;
    panels.push({
      type: "radar", title: "Why today's pick", caption: clip(top.action, 110),
      axes: [
        { label: "Impact", value: s.impact }, { label: "Urgency", value: s.urgency }, { label: "Goal fit", value: s.goal_relevance },
        { label: "Evidence", value: s.evidence_value }, { label: "Fits you", value: s.founder_fit }, { label: "Likely done", value: s.execution_probability },
      ],
    });
    const alts = state.decision.candidates.filter((c) => c.id !== top.id).sort((a, b) => b.scores.total - a.scores.total).slice(0, 4);
    if (alts.length) {
      panels.push({
        type: "tree", title: "What else was considered", root: `Chosen: ${clip(top.action, 70)} (${Math.round(top.scores.total)})`,
        branches: alts.map((a) => ({ label: clip(a.action, 90), tone: "neutral" as VisualTone, note: `scored ${Math.round(a.scores.total)}, ${Math.round(top.scores.total - a.scores.total)} below the pick`, children: a.rationale ? [{ label: clip(a.rationale, 110) }] : undefined })),
      });
    }
  }

  // 8. What changed
  const changes = [...state.temporal.week_over_week_changes, ...state.temporal.today_changes].filter(Boolean).slice(0, 3);
  if (changes.length) panels.push({ type: "callout", title: "What changed", text: changes.join(" "), tone: "accent" });

  return {
    title: "Execution intelligence",
    subtitle: state.startup.current_goal ? `Goal: ${clip(state.startup.current_goal, 100)}` : undefined,
    generatedAt: input.generatedAt ?? state.generated_at,
    panels,
  };
}

export function buildProgressVisual(input: {
  scorecard: Pick<FounderScorecard, "momentum" | "streak" | "xp" | "momentumDelta" | "tasksCompletedTotal">;
  milestones: MilestoneProgress[];
  log?: ExecutionLogView | null;
  days?: number;
  now?: Date;
}): VisualSpec {
  const { scorecard: sc, milestones, log } = input;
  const now = input.now ?? new Date();
  const panels: VisualPanel[] = [];

  panels.push({ type: "stats", title: "Progress at a glance", items: [
    { label: "Momentum", value: String(Math.round(sc.momentum)), sub: sc.momentumDelta == null ? "no baseline yet" : `${sc.momentumDelta > 0 ? "+" : ""}${sc.momentumDelta} vs last week`, tone: toneForScore(sc.momentum) },
    { label: "Streak", value: `${sc.streak}d`, tone: sc.streak >= 3 ? "good" : sc.streak ? "warn" : "neutral" },
    { label: "XP", value: String(sc.xp), tone: "accent" },
    { label: "Milestones done", value: `${milestones.filter((m) => m.status === "completed").length}/${milestones.length}`, tone: "accent" },
  ] });

  const withTasks = milestones.filter((m) => m.total > 0); // a milestone with no tasks has no progress to draw
  if (withTasks.length) {
    panels.push({
      type: "bars", title: "Milestones", unit: "%", caption: "Share of each milestone's tasks that are done.",
      items: withTasks.slice(0, 8).map((m) => {
        const pct = m.total ? Math.round((m.done / m.total) * 100) : 0;
        const late = m.daysToTarget !== null && m.daysToTarget < 0 && m.status !== "completed";
        return { label: m.title, value: pct, max: 100, tone: m.status === "completed" ? "good" : late ? "bad" : "accent", note: `${m.done} of ${m.total} tasks${late ? `, ${-m.daysToTarget!}d past target` : m.daysToTarget != null && m.status !== "completed" ? `, ${m.daysToTarget}d left` : ""}` };
      }),
    });
  }

  if (log && log.entries.length) {
    const days = Math.min(input.days ?? 28, 35);
    const byDay = new Map<string, number>();
    for (const e of log.entries) {
      const k = e.effectiveAt.slice(0, 10);
      const v = e.outcome === "completed" ? 1 : e.outcome === "partial" ? 0.5 : 0;
      byDay.set(k, Math.max(byDay.get(k) ?? 0, v));
    }
    const cells: Array<{ label: string; value: number; note?: string }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i)).toISOString().slice(0, 10);
      const v = byDay.get(d) ?? 0;
      cells.push({ label: d.slice(5), value: v, note: v === 1 ? "completed" : v === 0.5 ? "partial" : "nothing logged" });
    }
    panels.push({ type: "heat", title: `Your last ${days} days`, caption: "Brighter means a finished action that day. Dark means nothing was logged. Dates are UTC.", cells });
    const c = log.counts;
    panels.push({ type: "bars", title: "How actions ended", items: [
      { label: "Completed", value: c.completed, max: Math.max(log.entries.length, 1), tone: "good" },
      { label: "Partial", value: c.partial, max: Math.max(log.entries.length, 1), tone: "warn" },
      { label: "Skipped", value: c.skipped, max: Math.max(log.entries.length, 1), tone: "bad" },
      { label: "No outcome logged", value: c.pending, max: Math.max(log.entries.length, 1), tone: "neutral" },
    ] });
  }
  return { title: "Your progress", subtitle: "Momentum, milestones and the last few weeks", generatedAt: now.toISOString(), panels };
}
