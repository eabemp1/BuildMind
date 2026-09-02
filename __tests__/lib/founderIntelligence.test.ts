import { describe, expect, it } from "vitest";
import {
  buildDecisionState,
  buildFounderIntelligencePromptBlock,
  buildFounderIntelligenceState,
  deriveTemporalCoherence,
  type FounderIntelligenceInput,
} from "../../lib/founderIntelligence";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function baseInput(overrides: Partial<FounderIntelligenceInput> = {}): FounderIntelligenceInput {
  return {
    now: NOW,
    founderContext: {
      current_stage: "Validation",
      momentum_score: 42,
      momentum_last_week: 58,
      avoidance_zones: ["customer interviews"],
      timezone_offset: 0,
    },
    founderMemory: {
      strengths: ["technical"],
      avoidance_zones: ["pricing conversations"],
    },
    project: {
      id: "p1",
      name: "ConsentFlow",
      startup_stage: "Validation",
      problem: "consent tracking is painful",
      target_users: "privacy officers",
      current_mrr: 0,
    },
    milestones: [
      { id: "m1", title: "Validate consent pain", status: "in_progress", created_at: "2026-07-20T00:00:00.000Z", updated_at: "2026-07-24T00:00:00.000Z" },
    ],
    tasks: [
      { id: "t1", milestone_id: "m1", title: "Interview privacy officers", status: "pending", is_completed: false, created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z" },
      { id: "t2", milestone_id: "m1", title: "Record interview evidence", status: "pending", is_completed: false, created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-18T00:00:00.000Z" },
    ],
    reflections: [
      { today_action: "Polish onboarding UI", outcome: "completed", confidence: 4, note: "Made the UI nicer", created_at: "2026-08-04T10:00:00.000Z" },
      { today_action: "Refactor auth flow", outcome: "completed", confidence: 4, note: "Cleaned up login", created_at: "2026-08-03T10:00:00.000Z" },
      { today_action: "Update landing copy", outcome: "completed", confidence: 3, note: "Internal copy work", created_at: "2026-08-02T10:00:00.000Z" },
      { today_action: "Message 3 privacy officers", outcome: "blocked", confidence: 2, blocker: "felt too early", note: "Didn't send", created_at: "2026-08-01T10:00:00.000Z" },
      { today_action: "Draft product page", outcome: "completed", confidence: 3, note: "More internal work", created_at: "2026-07-29T10:00:00.000Z" },
    ],
    learningLogs: [
      { id: "1", user_id: "u", session_id: "s1", stage: "Validation", action_shown: "Message 3 privacy officers", action_type: "outreach", action_platform: "linkedin", outcome: "overridden", created_at: "2026-08-01T09:00:00.000Z" },
      { id: "2", user_id: "u", session_id: "s2", stage: "Validation", action_shown: "Ask one user about pricing", action_type: "pricing", action_platform: "email", outcome: "ignored", created_at: "2026-07-31T09:00:00.000Z" },
      { id: "3", user_id: "u", session_id: "s3", stage: "Validation", action_shown: "Build settings page", action_type: "build", action_platform: "other", outcome: "completed", created_at: "2026-07-30T09:00:00.000Z" },
      { id: "4", user_id: "u", session_id: "s4", stage: "Validation", action_shown: "Send validation email", action_type: "outreach", action_platform: "email", outcome: "overridden", created_at: "2026-07-29T09:00:00.000Z" },
      { id: "5", user_id: "u", session_id: "s5", stage: "Validation", action_shown: "Build dashboard card", action_type: "build", action_platform: "other", outcome: "completed", created_at: "2026-07-28T09:00:00.000Z" },
    ],
    activityEvents: [
      { event_type: "task_completed", occurred_at: "2026-08-04T09:00:00.000Z" },
      { event_type: "task_accepted", occurred_at: "2026-08-04T17:00:00.000Z" },
      { event_type: "login", occurred_at: "2026-08-03T17:00:00.000Z" },
    ],
    actionLogs: [],
    ...overrides,
  };
}

describe("Founder Intelligence coherence layer", () => {
  it("turns existing subsystems into typed signals with evidence", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const types = state.signals.map((s) => s.type);

    expect(types).toContain("EVIDENCE_GAP");
    expect(types).toContain("GOAL_SLIPPAGE");
    expect(types).toContain("BUSYWORK_PATTERN");
    expect(types).toContain("REPEATED_AVOIDANCE");
    expect(types).toContain("MOMENTUM_CHANGE");
    expect(state.signals.every((s) => s.evidence.length > 0)).toBe(true);
  });

  it("builds coherent founder, startup, strategy, execution, and temporal state", () => {
    const state = buildFounderIntelligenceState(baseInput());

    expect(state.founder.avoidance_patterns).toContain("customer interviews");
    expect(state.startup.current_goal).toBe("Validate consent pain");
    expect(state.strategy.stated_priorities[0]).toContain("commitment evidence");
    expect(state.execution.completed_actions.length).toBeGreaterThan(0);
    expect(state.temporal.week_changes.length).toBeGreaterThan(0);
  });

  it("ranks evidence-producing action candidates ahead of generic continuation when evidence is missing", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const decision = buildDecisionState(state);

    expect(decision.top_candidate?.id).toBe("evidence_probe");
    expect(decision.top_candidate?.scores.evidence_value).toBeGreaterThanOrEqual(75);
    expect(decision.top_candidate?.why_it_beats_alternatives).toContain("evidence");
  });

  it("renders a compact prompt block for Reflexion instead of only flattened recent history", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const block = buildFounderIntelligencePromptBlock(state);

    expect(block).toContain("FOUNDER INTELLIGENCE OS STATE");
    expect(block).toContain("Top machine-readable signals");
    expect(block).toContain("Deterministic top candidate");
  });

  it("compares this week against last week", () => {
    const temporal = deriveTemporalCoherence(baseInput({
      reflections: [
        { today_action: "Call user", outcome: "completed", note: "spoke to customer", created_at: "2026-08-04T10:00:00.000Z" },
        { today_action: "Build thing", outcome: "completed", note: "built", created_at: "2026-07-29T10:00:00.000Z" },
      ],
    }));

    expect(temporal.week_changes.join(" ")).toContain("External evidence actions moved");
    expect(temporal.increasing_behaviors).toContain("external evidence seeking");
  });

  it("uses a stable, row-addressable signal identity for a genuine milestone stall", () => {
    const state = buildFounderIntelligenceState(baseInput({ userId: "u1", projectId: "p1" }));
    const signal = state.signals.find((item) => item.type === "GOAL_SLIPPAGE");
    expect(signal?.id).toBe("GOAL_SLIPPAGE:p1:m1");
    expect(signal?.evidence.some((item) => item.record_id === "m1")).toBe(true);
    expect(signal?.observation_count).toBeGreaterThanOrEqual(2);
  });

  it("does not report slippage when linked task movement is recent", () => {
    const state = buildFounderIntelligenceState(baseInput({
      tasks: [
        { id: "t1", milestone_id: "m1", title: "Interview privacy officers", is_completed: true, status: "completed", created_at: "2026-08-04T09:00:00.000Z", updated_at: "2026-08-04T09:00:00.000Z" },
        { id: "t2", milestone_id: "m1", title: "Record interview evidence", is_completed: false, status: "pending", created_at: "2026-07-15T00:00:00.000Z" },
      ],
    }));
    expect(state.signals.some((item) => item.type === "GOAL_SLIPPAGE")).toBe(false);
  });

  it("does not turn a stale timestamp into slippage when linked execution coverage is low", () => {
    const state = buildFounderIntelligenceState(baseInput({
      tasks: [{ id: "t1", milestone_id: "m1", title: "Interview privacy officers", is_completed: false, status: "pending", created_at: "2026-07-15T00:00:00.000Z" }],
      activityEvents: [],
    }));
    expect(state.signals.some((item) => item.type === "GOAL_SLIPPAGE")).toBe(false);
  });
});
