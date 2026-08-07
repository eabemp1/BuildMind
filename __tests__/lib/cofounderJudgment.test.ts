import { describe, expect, it } from "vitest";
import { buildCofounderJudgment, evaluateFounderProposal } from "../../lib/cofounderJudgment";
import type { FounderIntelligenceState } from "../../lib/founderIntelligence";

const state: FounderIntelligenceState = {
  founder: { strengths: [], avoidance_patterns: ["customer outreach"], execution_patterns: [], operating_windows: [], recommendation_acceptance: [], recommendation_rejection: [], behavioral_trends: [], confidence: 72, recent_changes: [], corrections: [] },
  startup: { current_goal: "Validate buyer demand", active_milestones: ["Validate buyer demand"], stalled_milestones: [], current_projects: ["BuildMind"], evidence: [], assumptions: ["Buyers need this"], risks: [], metrics: {}, strategic_priorities: ["Validation"], recent_changes: [] },
  strategy: { stated_priorities: ["Validation"], observed_priorities: ["building"], contradictions: ["Building is outrunning validation."], strategic_drift: [], priority_confidence: 80 },
  execution: { completed_actions: ["Updated the dashboard"], skipped_actions: ["Message a customer"], delayed_actions: [], repeated_actions: [], outcome_quality: ["No external evidence"], execution_velocity: 50 },
  temporal: { today_changes: [], week_changes: [], week_over_week_changes: [], increasing_behaviors: [], decreasing_behaviors: [], strengthening_patterns: [], weakening_patterns: [] },
  signals: [{ type: "EVIDENCE_GAP", severity: "high", confidence: 0.86, title: "Evidence gap", summary: "Recent work has not produced fresh external evidence.", evidence: [{ source: "reflections", detail: "No customer outcome in recent completed work" }], detected_at: "2026-08-07", recommended_response: "Run one customer validation action." }],
  decision: { candidates: [{ id: "customer_call", action: "Message three target buyers for a 15-minute interview", rationale: "Reduce uncertainty", expected_evidence: "Three buyer responses", scores: { impact: 90, urgency: 90, goal_relevance: 90, evidence_value: 95, founder_fit: 60, execution_probability: 60, opportunity_cost: 10, repetition_penalty: 0, behavioral_correction: 20, risk_reduction: 90, confidence: 86, total: 88 }, supporting_signals: ["EVIDENCE_GAP"], why_it_beats_alternatives: "It creates direct evidence." }], top_candidate: null, decision_basis: [] },
  source_summary: { reflections: 4, learning_logs: 0, activity_events: 3, milestones: 1, tasks: 2, action_logs: 0 }, generated_at: "2026-08-07",
};
state.decision.top_candidate = state.decision.candidates[0];

describe("digital cofounder judgment", () => {
  it("makes an evidence gap explicit and supplies a negative recommendation", () => {
    const judgment = buildCofounderJudgment(state);
    expect(judgment.largest_constraint).toContain("external evidence");
    expect(judgment.should_not_do[0]?.type).toBe("validate_before_building");
    expect(judgment.intervention.mode).toBe("challenge");
  });

  it("defers feature work when validation is the current bottleneck", () => {
    const evaluation = evaluateFounderProposal("Build a new analytics dashboard", state);
    expect(evaluation.decision).toBe("defer");
    expect(evaluation.higher_leverage_action).toContain("Message three target buyers");
  });

  it("agrees with a proposal that directly creates needed evidence", () => {
    const evaluation = evaluateFounderProposal("Message target customers to request interviews", state);
    expect(evaluation.decision).toBe("agree");
  });

  it("holds the expected line across ten decision, uncertainty, and intervention scenarios", () => {
    const clone = (): FounderIntelligenceState => structuredClone(state);
    const scenario = (type: FounderIntelligenceState["signals"][number]["type"], severity: FounderIntelligenceState["signals"][number]["severity"], confidence = 0.8) => {
      const next = clone();
      next.signals = [{ ...next.signals[0], type, severity, confidence, summary: `${type} is active.` }];
      return next;
    };

    const coldStart = clone();
    coldStart.source_summary.reflections = 0;
    coldStart.source_summary.activity_events = 0;

    const cases = [
      ["cold start investigates rather than pretending certainty", evaluateFounderProposal("Build a feature", coldStart).decision, "investigate"],
      ["evidence gap defers building", evaluateFounderProposal("Build a feature", scenario("EVIDENCE_GAP", "high")).decision, "defer"],
      ["evidence gap accepts outreach", evaluateFounderProposal("Message prospective customers", scenario("EVIDENCE_GAP", "high")).decision, "agree"],
      ["assumption decay defers building", evaluateFounderProposal("Redesign the dashboard", scenario("ASSUMPTION_DECAY", "high")).decision, "defer"],
      ["goal slippage challenges the proposal", evaluateFounderProposal("Work on a side feature", scenario("GOAL_SLIPPAGE", "high")).decision, "agree_with_modification"],
      ["busywork challenges the proposal", evaluateFounderProposal("Refactor internal code", scenario("BUSYWORK_PATTERN", "high")).decision, "agree_with_modification"],
      ["high risk creates a challenge", buildCofounderJudgment(scenario("REPEATED_AVOIDANCE", "high")).intervention.mode, "challenge"],
      ["critical risk escalates", buildCofounderJudgment(scenario("EXECUTION_DEGRADATION", "critical")).intervention.mode, "escalation"],
      ["medium risk suggests", buildCofounderJudgment(scenario("MOMENTUM_CHANGE", "medium")).intervention.mode, "suggestion"],
      ["low signal stays passive", buildCofounderJudgment(scenario("FOUNDER_BEHAVIOR_CHANGE", "low")).intervention.mode, "passive_insight"],
    ] as const;

    for (const [, actual, expected] of cases) expect(actual).toBe(expected);
  });
});
