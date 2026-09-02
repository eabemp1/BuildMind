import { describe, expect, it, vi } from "vitest";
import {
  compareFounderIntelligenceOutcome,
  recordFounderIntelligencePrediction,
  updateIntelligenceAccuracy,
} from "../../lib/learningLoop";
import type { DecisionCandidate } from "../../lib/founderIntelligence";

// Minimal chainable mock mirroring the subset of the Supabase query builder
// lib/learningLoop.ts actually calls (.from().select/insert/update().eq()...).
function makeSupabase(overrides: {
  insertResult?: any;
  selectPendingResult?: any;
  selectAccuracyRowsResult?: any;
  updateResult?: any;
  founderContextUpdate?: ReturnType<typeof vi.fn>;
}) {
  const founderContextUpdate = overrides.founderContextUpdate ?? vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

  const builder: any = {
    from: vi.fn((table: string) => {
      if (table === "reflexion_learning_log") {
        return {
          insert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue(overrides.insertResult ?? { data: { id: "log-1" }, error: null }),
            })),
          })),
          select: vi.fn((cols: string) => {
            if (cols.includes("predicted_evidence")) {
              return {
                eq: () => ({
                  eq: () => ({
                    eq: () => ({
                      eq: () => ({
                        order: () => ({
                          limit: () => ({
                            maybeSingle: vi.fn().mockResolvedValue(overrides.selectPendingResult ?? { data: null, error: null }),
                          }),
                        }),
                      }),
                    }),
                  }),
                }),
              };
            }
            // accuracy rows query
            return {
              eq: () => ({
                eq: () => ({
                  not: () => ({
                    order: () => ({
                      limit: vi.fn().mockResolvedValue(overrides.selectAccuracyRowsResult ?? { data: [], error: null }),
                    }),
                  }),
                }),
              }),
            };
          }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue(overrides.updateResult ?? { error: null }),
          })),
        };
      }
      if (table === "founder_context") {
        return { update: founderContextUpdate };
      }
      return {};
    }),
  };
  return { builder, founderContextUpdate };
}

const candidate: DecisionCandidate = {
  id: "evidence_probe",
  action: "Message a privacy officer and ask about audit trail requirements",
  rationale: "test",
  expected_evidence: "A privacy officer response about audit trail requirements",
  scores: { impact: 90, urgency: 90, goal_relevance: 80, evidence_value: 90, founder_fit: 75, execution_probability: 65, opportunity_cost: 15, repetition_penalty: 0, behavioral_correction: 45, risk_reduction: 85, confidence: 82, total: 88 },
  supporting_signals: ["EVIDENCE_GAP"],
  why_it_beats_alternatives: "test",
};

describe("learningLoop: recordFounderIntelligencePrediction (PREDICT)", () => {
  it("writes a pending row with the candidate action and expected evidence", async () => {
    const { builder } = makeSupabase({});
    const id = await recordFounderIntelligencePrediction(builder, {
      userId: "u1",
      projectId: "p1",
      stage: "Validation",
      sessionId: "s1",
      candidate,
    });
    expect(id).toBe("log-1");
  });

  it("never throws when the insert fails", async () => {
    const { builder } = makeSupabase({ insertResult: { data: null, error: new Error("db down") } });
    const id = await recordFounderIntelligencePrediction(builder, {
      userId: "u1",
      stage: "Validation",
      sessionId: "s1",
      candidate,
    });
    expect(id).toBeNull();
  });
});

describe("learningLoop: compareFounderIntelligenceOutcome (COMPARE)", () => {
  it("returns null when there is no pending prediction", async () => {
    const { builder } = makeSupabase({ selectPendingResult: { data: null, error: null } });
    const result = await compareFounderIntelligenceOutcome(builder, { userId: "u1", recommendationId: "log-1", taskTitle: "Something unrelated", outcome: "completed" });
    expect(result).toBeNull();
  });

  it("scores a high match when the observed outcome overlaps the predicted evidence", async () => {
    const { builder } = makeSupabase({
      selectPendingResult: {
        data: { id: "log-1", action_shown: candidate.action, predicted_evidence: candidate.expected_evidence, created_at: "2026-08-04T00:00:00.000Z" },
        error: null,
      },
    });
    const result = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1",
      recommendationId: "log-1",
      taskTitle: "Message a privacy officer",
      outcome: "completed",
      reflectionText: "Got a response from a privacy officer about audit trail requirements",
    });
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(0.5);
    expect(result!.matched).toBe(true);
  });

  it("scores a low match when the observed outcome is unrelated", async () => {
    const { builder } = makeSupabase({
      selectPendingResult: {
        data: { id: "log-1", action_shown: candidate.action, predicted_evidence: candidate.expected_evidence, created_at: "2026-08-04T00:00:00.000Z" },
        error: null,
      },
    });
    const result = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1",
      recommendationId: "log-1",
      taskTitle: "Fixed a CSS bug on the landing page",
      outcome: "blocked",
    });
    expect(result).not.toBeNull();
    expect(result!.score).toBeLessThan(0.5);
    expect(result!.matched).toBe(false);
  });

  it("does not train against a legacy outcome without an explicit recommendation ID", async () => {
    const { builder } = makeSupabase({
      selectPendingResult: { data: { id: "log-1" }, error: null },
    });
    await expect(compareFounderIntelligenceOutcome(builder, {
      userId: "u1", taskTitle: "Message a privacy officer", outcome: "completed",
    })).resolves.toBeNull();
  });

  it("does not resolve an attributed recommendation without founder-provided evidence", async () => {
    const { builder } = makeSupabase({
      selectPendingResult: { data: { id: "log-1" }, error: null },
    });
    await expect(compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "Message a privacy officer", outcome: "completed",
    })).resolves.toBeNull();
  });
});

describe("learningLoop: updateIntelligenceAccuracy (LEARN)", () => {
  it("returns default accuracy when there is no resolved history", async () => {
    const { builder } = makeSupabase({ selectAccuracyRowsResult: { data: [], error: null } });
    const accuracy = await updateIntelligenceAccuracy(builder, "u1");
    expect(accuracy.sample_size).toBe(0);
    expect(accuracy.trend).toBe("unknown");
  });

  it("detects an improving trend when recent scores beat older scores", async () => {
    const rows = [
      { evidence_match_score: 0.9 }, { evidence_match_score: 0.85 }, { evidence_match_score: 0.8 }, { evidence_match_score: 0.75 }, { evidence_match_score: 0.7 },
      { evidence_match_score: 0.3 }, { evidence_match_score: 0.25 }, { evidence_match_score: 0.2 },
    ];
    const { builder, founderContextUpdate } = makeSupabase({ selectAccuracyRowsResult: { data: rows, error: null } });
    const accuracy = await updateIntelligenceAccuracy(builder, "u1");
    expect(accuracy.trend).toBe("up");
    expect(accuracy.sample_size).toBe(8);
    expect(founderContextUpdate).toHaveBeenCalled();
  });
});
