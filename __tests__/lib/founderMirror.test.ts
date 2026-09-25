import { describe, expect, it } from "vitest";
import { buildFounderIntelligenceState, type FounderIntelligenceInput } from "../../lib/founderIntelligence";
import { buildFounderMirror, normalizeBeliefKey } from "../../lib/founderMirror";
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

  it("exposes the graph-backed signals and decision-with-alternatives sections in a stable shape", () => {
    const state = buildFounderIntelligenceState(input());
    const mirror = buildFounderMirror(state, NO_ACCURACY);
    expect(Array.isArray(mirror.signals)).toBe(true);
    expect(mirror.decision).toHaveProperty("top");
    expect(mirror.decision).toHaveProperty("alternatives");
    expect(Array.isArray(mirror.decision.alternatives)).toBe(true);
    expect(Array.isArray(mirror.suppressed_beliefs)).toBe(true);
  });
});

describe("founderMirror: normalizeBeliefKey", () => {
  it("is deterministic and idempotent", () => {
    const key = normalizeBeliefKey("You tend to be strong at technical.");
    expect(key).toBe(normalizeBeliefKey("You tend to be strong at technical."));
    expect(normalizeBeliefKey(key)).toBe(key);
  });

  it("falls back to 'general' for empty/punctuation-only input", () => {
    expect(normalizeBeliefKey("...")).toBe("general");
    expect(normalizeBeliefKey("")).toBe("general");
  });
});

describe("founderMirror: correction feedback loop (Thompson-Sampling-style, same primitive as decision-candidate ranking)", () => {
  it("leaves every belief's confidence exactly unchanged when a correction targets an unrelated belief_key", () => {
    // Deterministic case: correctionScope() only ever matches the exact
    // targeted key or the "general" fallback, so a specific, non-general,
    // non-matching key must contribute zero weight to every belief —
    // no randomness involved, since applyCorrections() short-circuits
    // before calling sampleBeta when accumulated failure weight is ~0.
    const baseline = buildFounderMirror(buildFounderIntelligenceState(input()), NO_ACCURACY);
    const corrected = buildFounderMirror(
      buildFounderIntelligenceState(input({
        founderMemory: {
          strengths: ["technical"],
          avoidance_zones: ["pricing conversations"],
          founder_corrections: [
            { belief: "unrelated", correction: "this targets nothing real", belief_key: "totally-unrelated-belief-xyz", created_at: NOW.toISOString() },
          ],
        },
      })),
      NO_ACCURACY,
    );
    expect(corrected.beliefs.map((b) => b.belief).sort()).toEqual(baseline.beliefs.map((b) => b.belief).sort());
    for (const belief of corrected.beliefs) {
      const before = baseline.beliefs.find((b) => b.belief_key === belief.belief_key);
      expect(before).toBeDefined();
      expect(belief.confidence).toBe(before!.confidence);
      expect(belief.correction_effect).toBeNull();
    }
  });

  it("records a correction_effect with the right corrections_applied count and the true pre-correction confidence when a belief is targeted", () => {
    const baseline = buildFounderMirror(buildFounderIntelligenceState(input()), NO_ACCURACY);
    const target = baseline.beliefs[0];
    const corrected = buildFounderMirror(
      buildFounderIntelligenceState(input({
        founderMemory: {
          strengths: ["technical"],
          avoidance_zones: ["pricing conversations"],
          founder_corrections: [
            { belief: target.belief, correction: "that's not quite right", belief_key: target.belief_key, created_at: NOW.toISOString() },
          ],
        },
      })),
      NO_ACCURACY,
    );
    const correctedBelief = corrected.beliefs.find((b) => b.belief_key === target.belief_key);
    const suppressedInstead = corrected.suppressed_beliefs.find((s) => s.belief === target.belief);
    // Either still visible with a recorded effect, or pulled below the
    // suppression threshold — sampleBeta is stochastic, so both are valid
    // outcomes of *some* correction landing; what must always be true is
    // that one of the two happened, and if visible, the before-value is
    // exactly the model's real un-corrected confidence.
    expect(Boolean(correctedBelief) || Boolean(suppressedInstead)).toBe(true);
    if (correctedBelief) {
      expect(correctedBelief.correction_effect).not.toBeNull();
      expect(correctedBelief.correction_effect!.corrections_applied).toBe(1);
      expect(correctedBelief.correction_effect!.confidence_before).toBeCloseTo(target.confidence, 2);
      expect(correctedBelief.contradictory_evidence).toContain("that's not quite right");
    }
  });
});
