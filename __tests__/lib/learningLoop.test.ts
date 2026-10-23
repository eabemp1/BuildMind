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
              // .eq / .is filters chain freely, then order -> limit -> maybeSingle.
              const chain: any = {
                eq: () => chain,
                is: () => chain,
                order: () => chain,
                limit: () => chain,
                maybeSingle: vi.fn().mockResolvedValue(overrides.selectPendingResult ?? { data: null, error: null }),
              };
              return chain;
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
          update: vi.fn(() => {
            // .eq() chains (id, user_id, outcome='pending') and ends in .select() or is awaited directly.
            const res = overrides.updateResult ?? { data: [{ id: "log-1" }], error: null };
            const chain: any = {
              eq: () => chain,
              is: () => chain,
              select: () => Promise.resolve(res),
              then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad),
            };
            return chain;
          }),
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
      // A reflection is required to score at all; this one is unrelated.
      reflectionText: "Spent the afternoon adjusting button padding and fonts",
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

describe("learningLoop: exactly-once resolve", () => {
  it("returns null when another request already resolved the row", async () => {
    const { builder } = makeSupabase({
      selectPendingResult: { data: { id: "log-1", predicted_evidence: "x", action_shown: "y", created_at: "2026-10-20T00:00:00Z" }, error: null },
      updateResult: { data: [], error: null },
    });
    const result = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed", reflectionText: "did the thing",
    });
    expect(result).toBeNull();
  });
});

describe("learningLoop: structured outcomes", () => {
  // Captures every update payload; optionally rejects the first one the way a database without the
  // 20261022020000 migration does.
  function makeCapturing(opts: { failFirstWithMissingColumn?: boolean } = {}) {
    const payloads: Array<Record<string, unknown>> = [];
    let calls = 0;
    const builder: any = {
      from: (table: string) => {
        if (table === "founder_context") return { update: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        return {
          select: (cols: string) => {
            if (cols.includes("predicted_evidence")) {
              const chain: any = { eq: () => chain, is: () => chain, order: () => chain, limit: () => chain,
                maybeSingle: () => Promise.resolve({ data: { id: "log-1", action_shown: "Message a founder", predicted_evidence: "A reply from a founder", created_at: "2026-10-20T00:00:00Z" }, error: null }) };
              return chain;
            }
            const chain: any = { eq: () => chain, not: () => chain, order: () => chain, limit: () => Promise.resolve({ data: [{ evidence_match_score: 0.85, score_basis: "structured" }, { evidence_match_score: 0.25, score_basis: "text" }], error: null }) };
            return chain;
          },
          update: (payload: Record<string, unknown>) => {
            payloads.push(payload);
            calls += 1;
            const res = opts.failFirstWithMissingColumn && calls === 1
              ? { data: null, error: { code: "42703", message: 'column "signal_kind" of relation "reflexion_learning_log" does not exist' } }
              : { data: [{ id: "log-1" }], error: null };
            const chain: any = { eq: () => chain, is: () => chain, select: () => Promise.resolve(res) };
            return chain;
          },
        };
      },
    };
    return { builder, payloads };
  }

  it("scores from the structured signal, ignoring wording", async () => {
    const { builder, payloads } = makeCapturing();
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed",
      reflectionText: "totally unrelated words about fonts", signal: { kind: "reply", count: 2, trust: "proof" }, signalProof: { text: "reply from Ama: yes let us talk", hash: "h1" },
    });
    expect(r).toEqual({ matched: true, score: 0.75, basis: "structured" });
    expect(payloads[0]).toMatchObject({ score_basis: "structured", signal_kind: "reply", signal_count: 2, signal_source: "founder", signal_trust: "proof", signal_proof_hash: "h1", outcome_quality: "strong" });
  });

  it("a completed task that produced nothing is not a match", async () => {
    const { builder, payloads } = makeCapturing();
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed",
      reflectionText: "Got a reply from a founder", // wording would have matched; the signal says nothing happened
      signal: { kind: "none", count: 0 },
    });
    expect(r).toMatchObject({ matched: false, basis: "structured" });
    expect(r!.score).toBeLessThan(0.5);
    expect(payloads[0]).toMatchObject({ signal_kind: "none", outcome_quality: "useful" });
  });

  it("a structured signal alone is enough to resolve (no reflection text)", async () => {
    const { builder } = makeCapturing();
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed", signal: { kind: "call", count: 1 },
    });
    expect(r?.basis).toBe("structured");
  });

  it("falls back to the text score when no signal is given", async () => {
    const { builder, payloads } = makeCapturing();
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed", reflectionText: "Got a reply from a founder",
    });
    expect(r?.basis).toBe("text");
    expect(payloads[0]).toMatchObject({ score_basis: "text" });
    expect(payloads[0]).not.toHaveProperty("signal_kind");
  });

  it("still resolves the row on a database that lacks the new columns", async () => {
    const { builder, payloads } = makeCapturing({ failFirstWithMissingColumn: true });
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed", reflectionText: "x y z", signal: { kind: "signup", count: 1, trust: "verified" },
    });
    expect(r).not.toBeNull();
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toHaveProperty("signal_trust");
    // The first retry keeps the signal columns and drops only the trust ones.
    expect(payloads[1]).toHaveProperty("signal_kind");
    expect(payloads[1]).not.toHaveProperty("signal_trust");
  });

  it("a typed claim with nothing behind it is stored as unproven and does not count as a match", async () => {
    const { builder, payloads } = makeCapturing();
    const r = await compareFounderIntelligenceOutcome(builder, {
      userId: "u1", recommendationId: "log-1", taskTitle: "t", outcome: "completed", signal: { kind: "payment", count: 500 },
    });
    expect(r).toMatchObject({ matched: false, score: 0.4 });
    expect(payloads[0]).toMatchObject({ signal_trust: "self", outcome_quality: "useful" });
  });

  it("accuracy reports how many scores were structured", async () => {
    const { builder } = makeCapturing();
    const acc = await updateIntelligenceAccuracy(builder, "u1");
    expect(acc.sample_size).toBe(2);
    expect(acc.structured_count).toBe(1);
  });
});

describe("learningLoop: isArchetypeSuccess with structured signals", () => {
  it("a completed task that produced nothing is a failure even with a reflection reference", async () => {
    const { isArchetypeSuccess } = await import("../../lib/learningLoop");
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.25, outcome_quality: "useful", evidence_references: [{ source: "reflection", recordId: "r1" }], signal_kind: "none" })).toBe(false);
  });
  it("a completed task with a real signal is a success", async () => {
    const { isArchetypeSuccess } = await import("../../lib/learningLoop");
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.75, signal_kind: "reply" })).toBe(true);
  });
  it("legacy rows without a signal keep the old rules", async () => {
    const { isArchetypeSuccess } = await import("../../lib/learningLoop");
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.2, outcome_quality: "useful" })).toBe(false);
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.6 })).toBe(true);
    expect(isArchetypeSuccess({ outcome: "partial", evidence_match_score: 0.9, signal_kind: "reply" })).toBe(false);
  });
});

import { isUnprovenRow } from "../../lib/learningLoop";

describe("learningLoop: unproven claims are left out of learning", () => {
  it("flags only real-signal claims that nothing backs", () => {
    expect(isUnprovenRow({ signal_kind: "reply", signal_trust: "self" })).toBe(true);
    expect(isUnprovenRow({ signal_kind: "reply", signal_trust: "proof" })).toBe(false);
    expect(isUnprovenRow({ signal_kind: "visit", signal_trust: "verified" })).toBe(false);
    expect(isUnprovenRow({ signal_kind: "none", signal_trust: "self" })).toBe(false);
    expect(isUnprovenRow({})).toBe(false);
  });
});
