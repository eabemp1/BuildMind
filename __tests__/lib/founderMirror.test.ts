import { describe, expect, it } from "vitest";
import { buildFounderIntelligenceState, type FounderIntelligenceInput } from "../../lib/founderIntelligence";
import { buildFounderMirror } from "../../lib/founderMirror";
import type { IntelligenceAccuracy } from "../../lib/learningLoop";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function input(overrides: Partial<FounderIntelligenceInput> = {}): FounderIntelligenceInput {
  return {
    now: NOW,
    founderContext: { current_stage: "Validation", momentum_score: 42, avoidance_zones: ["customer interviews"] },
    founderMemory: { strengths: ["technical"], avoidance_zones: ["pricing conversations"] },
    project: { name: "ConsentFlow", startup_stage: "Validation", problem: "consent tracking is painful", target_users: "privacy officers" },
    milestones: [{ id: "m1", title: "Validate consent pain", status: "in_progress", created_at: "2026-07-20T00:00:00.000Z", updated_at: "2026-07-24T00:00:00.000Z" }],
    tasks: [{ id: "t1", milestone_id: "m1", title: "Interview privacy officers", status: "pending", is_completed: false, created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-30T00:00:00.000Z" }],
    reflections: [
      { today_action: "Polish onboarding UI", outcome: "completed", note: "Made the UI nicer", created_at: "2026-08-04T10:00:00.000Z" },
      { today_action: "Interview privacy officers", outcome: "blocked", note: "Kept postponing", created_at: "2026-07-29T10:00:00.000Z" },
    ],
    learningLogs: [],
    activityEvents: [],
    actionLogs: [],
    ...overrides,
  };
}

const NO_ACCURACY: IntelligenceAccuracy = { sample_size: 0, average_match_score: 0, last_updated_at: null, trend: "unknown" };

describe("founderMirror: buildFounderMirror", () => {
  it("produces beliefs with a why and evidence trail, not bare assertions", () => {
    const state = buildFounderIntelligenceState(input());
    const mirror = buildFounderMirror(state, NO_ACCURACY);
    expect(mirror.beliefs.length).toBeGreaterThan(0);
    for (const belief of mirror.beliefs) {
      expect(belief.why.length).toBeGreaterThan(0);
      expect(belief.confidence).toBeGreaterThan(0);
    }
  });

  it("surfaces strategy contradictions in may_be_wrong_about", () => {
    const state = buildFounderIntelligenceState(input());
    const mirror = buildFounderMirror(state, NO_ACCURACY);
    expect(mirror.may_be_wrong_about.length).toBeGreaterThan(0);
  });

  it("reports low sample size accuracy honestly rather than fabricating a percentage", () => {
    const state = buildFounderIntelligenceState(input());
    const mirror = buildFounderMirror(state, NO_ACCURACY);
    expect(mirror.self_reported_accuracy.accuracy_pct).toBeNull();
    expect(mirror.self_reported_accuracy.summary).toMatch(/not enough/i);
  });

  it("reports accuracy percentage and trend once there is enough resolved history", () => {
    const state = buildFounderIntelligenceState(input());
    const accuracy: IntelligenceAccuracy = { sample_size: 8, average_match_score: 0.72, last_updated_at: NOW.toISOString(), trend: "up" };
    const mirror = buildFounderMirror(state, accuracy);
    expect(mirror.self_reported_accuracy.accuracy_pct).toBe(72);
    expect(mirror.self_reported_accuracy.summary).toMatch(/improving/i);
  });

  it("flags a stale model when accuracy is low with enough samples", () => {
    const state = buildFounderIntelligenceState(input());
    const accuracy: IntelligenceAccuracy = { sample_size: 6, average_match_score: 0.2, last_updated_at: NOW.toISOString(), trend: "down" };
    const mirror = buildFounderMirror(state, accuracy);
    expect(mirror.may_be_wrong_about.some((m) => /stale/i.test(m))).toBe(true);
  });
});
