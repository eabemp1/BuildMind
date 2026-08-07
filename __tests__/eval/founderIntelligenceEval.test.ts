/**
 * __tests__/eval/founderIntelligenceEval.test.ts — Phase 15
 *
 * Tests whether the coherent build (lib/founderIntelligence.ts +
 * lib/founderRelationships.ts + lib/founderMirror.ts) can answer the 11
 * evaluation questions from the spec, using a synthetic founder scenario
 * with a deliberate strategy/behavior contradiction and a stalling goal.
 *
 * Each question is checked against two things:
 *   1. CURRENT BUILD baseline — what you could answer with only the raw rows
 *      (reflections/milestones/tasks), i.e. what existed before the
 *      coherence layer. This is intentionally weak, to make the comparison
 *      meaningful rather than a tautology.
 *   2. COHERENT BUILD — the synthesized FounderIntelligenceState.
 *
 * The scenario: a founder whose PROJECT says the current priority is
 * "customer interviews" (stated), but whose actual completed work this
 * week is UI polish (observed) — a strategy/behavior contradiction — while
 * the one milestone tied to interviews has been untouched for 9 days.
 */

import { describe, expect, it } from "vitest";
import {
  buildFounderIntelligenceState,
  type FounderIntelligenceInput,
} from "../../lib/founderIntelligence";
import { buildStartupRelationshipGraph, traceRelationshipChain } from "../../lib/founderRelationships";
import { buildFounderMirror } from "../../lib/founderMirror";
import type { IntelligenceAccuracy } from "../../lib/learningLoop";

const NOW = new Date("2026-08-05T12:00:00.000Z");

const scenario: FounderIntelligenceInput = {
  now: NOW,
  founderContext: {
    current_stage: "Validation",
    momentum_score: 38,
    momentum_last_week: 55,
    avoidance_zones: ["customer interviews"],
    timezone_offset: 0,
  },
  founderMemory: {
    strengths: ["shipping UI quickly"],
    avoidance_zones: ["pricing conversations"],
  },
  project: {
    name: "ConsentFlow",
    startup_stage: "Validation",
    problem: "consent tracking is painful for privacy officers",
    target_users: "privacy officers at mid-size healthcare companies",
    current_mrr: 0,
  },
  milestones: [
    { id: "m1", title: "Interview privacy officers", status: "in_progress", created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-27T00:00:00.000Z" },
  ],
  tasks: [
    { id: "t1", milestone_id: "m1", title: "Interview privacy officers", status: "pending", is_completed: false, created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-27T00:00:00.000Z" },
  ],
  reflections: [
    { today_action: "Polish onboarding UI", outcome: "completed", note: "Made the UI nicer", created_at: "2026-08-04T09:00:00.000Z" },
    { today_action: "Polish dashboard charts", outcome: "completed", note: "Redesigned the chart colors", created_at: "2026-08-03T09:00:00.000Z" },
    { today_action: "Polish settings page layout", outcome: "completed", note: "Reorganized the settings sections", created_at: "2026-08-02T09:00:00.000Z" },
    { today_action: "Interview privacy officers", outcome: "blocked", note: "Ran out of time, kept postponing", created_at: "2026-07-29T09:00:00.000Z" },
    { today_action: "Interview privacy officers", outcome: "blocked", note: "Postponed again", created_at: "2026-07-22T09:00:00.000Z" },
  ],
  learningLogs: [
    { user_id: "u1", action_shown: "Interview a privacy officer", outcome: "overridden", action_type: "user_interview", created_at: "2026-07-30T00:00:00.000Z" } as any,
    { user_id: "u1", action_shown: "Interview a privacy officer", outcome: "ignored", action_type: "user_interview", created_at: "2026-07-24T00:00:00.000Z" } as any,
  ],
  activityEvents: [],
  actionLogs: [],
};

const state = buildFounderIntelligenceState(scenario);
const graph = buildStartupRelationshipGraph(scenario, state);
const accuracy: IntelligenceAccuracy = { sample_size: 6, average_match_score: 0.3, last_updated_at: NOW.toISOString(), trend: "down" };
const mirror = buildFounderMirror(state, accuracy);

describe("Phase 15 eval: CURRENT BUILD baseline (raw rows only) is weak", () => {
  it("cannot express a stated-vs-observed contradiction without synthesis", () => {
    // The raw rows have no field that says "priority" vs "actual behavior" —
    // you'd have to eyeball reflections and milestones yourself.
    const rawHasContradictionField = (scenario.reflections ?? []).some((r) => "contradiction" in r);
    expect(rawHasContradictionField).toBe(false);
  });

  it("cannot rank next actions without synthesis", () => {
    const rawHasRanking = (scenario.tasks ?? []).some((t) => "score" in t);
    expect(rawHasRanking).toBe(false);
  });
});

describe("Phase 15 eval: COHERENT BUILD answers the 11 questions", () => {
  it("1. What is the founder actually prioritizing?", () => {
    expect(state.strategy.observed_priorities.length).toBeGreaterThan(0);
    expect(state.strategy.observed_priorities.join(" ")).not.toMatch(/interview/i);
  });

  it("2. What do they claim to prioritize?", () => {
    expect(state.strategy.stated_priorities.length).toBeGreaterThan(0);
  });

  it("3. Is there a contradiction?", () => {
    const hasContradictionSignal = state.signals.some((s) => s.type === "BEHAVIOR_STRATEGY_CONTRADICTION");
    expect(hasContradictionSignal).toBe(true);
    expect(state.strategy.contradictions.length).toBeGreaterThan(0);
  });

  it("4. What is slipping?", () => {
    expect(state.startup.stalled_milestones).toContain("Interview privacy officers");
    const hasSlippageSignal = state.signals.some((s) => s.type === "GOAL_SLIPPAGE");
    expect(hasSlippageSignal).toBe(true);
  });

  it("5. What assumption is least supported?", () => {
    expect(state.startup.assumptions.length).toBeGreaterThan(0);
    // FIX APPLIED: evidence derivation now filters to outcome === "completed"
    // || "done" before the keyword match counts (lib/founderIntelligence.ts).
    // The only "evidence" rows in this scenario are the two BLOCKED interview
    // attempts — keyword-matched text, but never actually completed — so
    // they correctly produce zero evidence now, and EVIDENCE_GAP correctly
    // fires. This test previously asserted the opposite (evidence.length > 0,
    // no EVIDENCE_GAP signal) as a way of pinning down the bug pending a fix
    // — see the "Phase 14 debt note" this comment used to reference. That fix
    // has since landed; this assertion was updated to match, not reverted.
    expect(state.startup.evidence.length).toBe(0);
    const evidenceSignal = state.signals.find((s) => s.type === "EVIDENCE_GAP");
    expect(evidenceSignal).toBeDefined();
  });

  it("6. What has changed?", () => {
    expect(state.temporal.week_changes.length).toBeGreaterThan(0);
  });

  it("7. What does the founder repeatedly avoid?", () => {
    expect(state.founder.avoidance_patterns.some((p) => /interview/i.test(p))).toBe(true);
  });

  it("8. What should they stop doing? (surfaced via decision reasoning + mirror)", () => {
    expect(state.decision.decision_basis.length).toBeGreaterThan(0);
    expect(mirror.may_be_wrong_about.length + mirror.beliefs.length).toBeGreaterThan(0);
  });

  it("9. What action should happen next?", () => {
    expect(state.decision.top_candidate).not.toBeNull();
    expect(state.decision.top_candidate!.action.length).toBeGreaterThan(0);
  });

  it("10. Why this action instead of the alternatives?", () => {
    expect(state.decision.top_candidate!.why_it_beats_alternatives.length).toBeGreaterThan(0);
    expect(state.decision.candidates.length).toBeGreaterThan(1);
  });

  it("11. What should BuildMind learn after the action?", () => {
    expect(state.decision.top_candidate!.expected_evidence.length).toBeGreaterThan(0);
  });
});

describe("Phase 15 eval: relationship graph explains beliefs with evidence, not assertion", () => {
  it("traces the stalling milestone back through tasks/actions to its outcomes", () => {
    const chain = traceRelationshipChain(graph, "Interview privacy officers");
    expect(chain.milestone).not.toBeNull();
    expect(chain.path.some((n) => n.type === "task")).toBe(true);
    expect(chain.path.some((n) => n.type === "outcome" && n.label === "blocked")).toBe(true);
  });
});

describe("Phase 15 eval: Founder Mirror is honest about its own accuracy", () => {
  it("flags itself as possibly stale when its recent predictions are missing the mark", () => {
    expect(mirror.self_reported_accuracy.trend).toBe("down");
    expect(mirror.may_be_wrong_about.some((m) => /stale/i.test(m))).toBe(true);
  });
});
