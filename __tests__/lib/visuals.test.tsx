import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { renderStatic } from "@/lib/visuals/staticRender";
import type { FounderIntelligenceState } from "@/lib/founderIntelligence";
import { buildExecutionIntelligenceVisual, buildProgressVisual } from "@/lib/visuals/intelligenceVisual";
import { VisualBoard } from "@/components/visuals/VisualBoard";
import { renderVisualReportHtml } from "@/lib/visuals/reportHtml";
import { matchCoachAction } from "@/lib/coachActions/matcher";

const state = {
  generated_at: "2026-10-12T09:00:00.000Z",
  execution_state: {
    momentum: { score: 62, trend: "up", delta: 7, streak_days: 3 },
    execution: { completed_actions_7d: 4, completed_tasks_7d: 6, task_velocity_7d: 1.2, milestone_velocity_30d: null, repeated_postponements: 2, stall_days: null, inactivity_days: 0, focus_distribution: [{ category: "outreach", count: 5 }, { category: "build", count: 2 }] },
  },
  founder: { strengths: ["Ships fast"], avoidance_patterns: ["Customer calls"], execution_patterns: [], operating_windows: ["Mornings"], recommendation_acceptance: [], recommendation_rejection: [], behavioral_trends: [], confidence: 0.6, recent_changes: [], corrections: [] },
  startup: { current_goal: "Get 5 paying users", active_milestones: [], stalled_milestones: [], current_projects: [], evidence: [], assumptions: [], risks: [], metrics: {}, strategic_priorities: [], recent_changes: [] },
  strategy: { stated_priorities: [], observed_priorities: [], contradictions: [], strategic_drift: [], priority_confidence: 0.5 },
  execution: { completed_actions: ["a", "b"], skipped_actions: ["c"], delayed_actions: [], repeated_actions: [], outcome_quality: [], execution_velocity: 66 },
  temporal: { today_changes: [], week_changes: [], week_over_week_changes: ["Outreach is up 3 actions on last week."], increasing_behaviors: [], decreasing_behaviors: [], strengthening_patterns: [], weakening_patterns: [] },
  signals: [{ id: "s1", type: "REPEATED_AVOIDANCE", severity: "high", confidence: 0.8, title: "Customer calls keep slipping", summary: "Postponed 3 times.", evidence: [], detected_at: "", recommended_response: "", coverage: { task_events: 1, reflections: 0, activity_events: 0, recommendation_outcomes: 0 }, observation_count: 3, limitations: [], lifecycle: "active" }],
  decision: {
    candidates: [], decision_basis: [],
    top_candidate: { id: "t", action: "Call 2 customers", rationale: "r", expected_evidence: "e", supporting_signals: [], why_it_beats_alternatives: "w", scores: { impact: 90, urgency: 80, goal_relevance: 85, evidence_value: 90, founder_fit: 50, execution_probability: 60, opportunity_cost: 15, repetition_penalty: 0, behavioral_correction: 80, risk_reduction: 85, confidence: 70, total: 82 } },
  },
  archetype_stats: {}, source_summary: { reflections: 0, learning_logs: 0, activity_events: 0, milestones: 0, tasks: 0, action_logs: 0 },
} as unknown as FounderIntelligenceState;

describe("execution intelligence visual", () => {
  const spec = buildExecutionIntelligenceVisual({
    state,
    trend: [{ recordedAt: "2026-10-01T00:00:00Z", daysInactive: 4 }, { recordedAt: "2026-10-02T00:00:00Z", daysInactive: 0 }],
    accuracy: { sample_size: 12, average_match_score: 0.64 },
  });

  it("draws the real numbers and nothing invented", () => {
    const json = JSON.stringify(spec);
    expect(spec.panels.map((p) => p.type)).toEqual(expect.arrayContaining(["stats", "gauge", "line", "bars", "signals", "radar", "tree"]));
    expect(json).toContain("Customer calls keep slipping");
    expect(json).toContain("Call 2 customers");
    expect(json).toContain("Outreach is up 3 actions");
  });

  it("leaves out panels it has no data for", () => {
    const bare = buildExecutionIntelligenceVisual({ state: { ...state, signals: [], decision: { candidates: [], top_candidate: null, decision_basis: [] } } as unknown as FounderIntelligenceState });
    expect(bare.panels.some((p) => p.type === "signals")).toBe(false);
    expect(bare.panels.some((p) => p.type === "radar")).toBe(false);
    expect(bare.panels.some((p) => p.type === "line")).toBe(false);
  });

  it("renders to static HTML and to a self-contained report", () => {
    const html = renderToStaticMarkup(<VisualBoard spec={spec} />);
    expect(html).toContain("Execution intelligence");
    expect(html).toContain("<svg");
    const doc = renderVisualReportHtml(spec);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("window.print()");
    expect(doc).not.toMatch(/<script src=|<link /);
  });

  it("escapes text that came from the founder's data", () => {
    const hostile = { ...spec, title: "<img src=x onerror=alert(1)>" };
    expect(renderVisualReportHtml(hostile)).not.toContain("<img src=x");
  });
});

describe("progress visual", () => {
  it("builds milestone bars and a calendar from the log", () => {
    const spec = buildProgressVisual({
      scorecard: { momentum: 55, streak: 2, xp: 120, momentumDelta: -3, tasksCompletedTotal: 9 },
      milestones: [{ id: "m", title: "Launch", status: "in_progress", total: 4, done: 1, daysToTarget: -2 } as never],
      log: { entries: [{ action: "x", effectiveAt: "2026-10-11T10:00:00Z", outcome: "completed", source: "today" }], counts: { completed: 1, partial: 0, skipped: 0, ignored: 0, pending: 0 }, daysWithCompletion: 1, truncated: false } as never,
      now: new Date("2026-10-12T12:00:00Z"),
    });
    const heat = spec.panels.find((p) => p.type === "heat");
    expect(heat && heat.type === "heat" && heat.cells).toHaveLength(28);
    expect(heat && heat.type === "heat" && heat.cells.find((c) => c.label === "10-11")?.value).toBe(1);
    expect(JSON.stringify(spec)).toContain("past target");
  });
});

describe("drawing requests", () => {
  it("routes picture requests to the visual actions", () => {
    expect(matchCoachAction("draw my execution intelligence")?.id).toBe("draw_execution_intelligence");
    expect(matchCoachAction("can you visualize my signals")?.id).toBe("draw_execution_intelligence");
    expect(matchCoachAction("chart my progress this month")?.id).toBe("draw_progress");
    expect(matchCoachAction("graph my momentum")?.id).toBe("draw_progress");
  });
  it("does not hijack ordinary conversation", () => {
    expect(matchCoachAction("I want to chart a course for the company")).toBeNull();
    expect(matchCoachAction("what should I do next")).toBeNull();
    expect(matchCoachAction("show me json examples for my API")).toBeNull();
  });
});

describe("staticRender (no react-dom/server in routes)", () => {
  it("draws the same text content and SVG as react-dom/server", () => {
    const spec = buildExecutionIntelligenceVisual({ state });
    const a = renderStatic(<VisualBoard spec={spec} />);
    const b = renderToStaticMarkup(<VisualBoard spec={spec} />);
    const text = (h: string) => h.replace(/&#x27;/g, "&#39;").replace(/<[^>]+>/g, "").replace(/<!-- -->/g, "").replace(/\s+/g, " ");
    expect(text(a)).toBe(text(b));
    expect((a.match(/<svg/g) ?? []).length).toBe((b.match(/<svg/g) ?? []).length);
    expect(a).not.toContain("[object");
    expect(a).toContain("stroke-width");
  });
});
