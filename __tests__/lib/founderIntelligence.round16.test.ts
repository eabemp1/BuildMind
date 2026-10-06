import { describe, expect, it } from "vitest";
import {
  buildDecisionState,
  buildFounderIntelligenceState,
  refreshDecisionBasis,
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

describe("round 16 intelligence rules", () => {
  it("does not repeat an intervention that failed every time", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const withHistory = { ...state, archetype_stats: {
      evidence_probe: { successes: 0, failures: 3, recent_successes: 0, recent_failures: 3 },
    } };
    const d = buildDecisionState(withHistory);
    const probe = d.candidates.find((c) => c.id === "evidence_probe");
    expect(probe?.scores.intervention_penalty).toBeGreaterThanOrEqual(20);
    expect(probe?.why_it_beats_alternatives).toMatch(/Ranked down/);
    expect(d.top_candidate?.id).not.toBe("evidence_probe");
  });

  it("does not penalise an action with no history", () => {
    const d = buildDecisionState(buildFounderIntelligenceState(baseInput()));
    expect(d.candidates.every((c) => (c.scores.intervention_penalty ?? 0) === 0)).toBe(true);
  });

  it("gives candidates their own execution probability once there is history", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const d = buildDecisionState({ ...state, archetype_stats: {
      evidence_probe: { successes: 0, failures: 2, recent_successes: 0, recent_failures: 2 },
    } });
    const values = new Set(d.candidates.map((c) => c.scores.execution_probability));
    expect(values.size).toBeGreaterThan(1);
  });

  it("flags a close call instead of presenting a tie as a win", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const d = buildDecisionState(state);
    const [a, b] = d.candidates;
    const close = a && b && a.scores.total - b.scores.total <= 3;
    const line = d.decision_basis.find((l) => l.startsWith("Close call"));
    expect(Boolean(line)).toBe(Boolean(close));
    const refreshed = refreshDecisionBasis(d, state.signals, new Date(state.generated_at));
    expect(refreshed.decision_basis.some((l) => l.startsWith("Close call"))).toBe(Boolean(close));
  });

  it("labels avoidance as an interpretation with other explanations", () => {
    const s = buildFounderIntelligenceState(baseInput()).signals.find((x) => x.type === "REPEATED_AVOIDANCE");
    expect(s?.interpretation_confidence).toBeLessThan(s?.confidence ?? 1);
    expect(s?.alternative_explanations?.length).toBeGreaterThan(1);
  });

  it("never lists the same change twice in different words", () => {
    const state = buildFounderIntelligenceState(baseInput());
    const lines = state.temporal.week_changes;
    const reflected = lines.filter((l) => /reflected action/i.test(l));
    expect(reflected.length).toBeLessThanOrEqual(1);
  });

  it("keeps priority confidence within the alignment confidence", () => {
    const state = buildFounderIntelligenceState(baseInput());
    expect(state.strategy.priority_confidence).toBeLessThanOrEqual(state.execution_state.alignment.confidence);
  });

  it("does not leave doubled full stops in action text", () => {
    const state = buildFounderIntelligenceState(baseInput({
      reflections: [{ today_action: "Post it about a thing.", outcome: "completed", note: "x..", created_at: "2026-08-04T10:00:00.000Z" }],
    }));
    expect(state.execution.completed_actions.every((a) => !/[^.]\.\.$/.test(a))).toBe(true);
  });
});
