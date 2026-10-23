/**
 * Main flow, end to end, with no database: Today picks a task -> the founder completes it and reports
 * what it produced -> the learning loop scores it -> the next ranking and the Mirror reflect it.
 * Each stage uses the real production functions; only storage is replaced by plain objects.
 */
import { describe, it, expect } from "vitest";
import { buildFounderIntelligenceState } from "@/lib/founderIntelligence";
import { buildFounderMirror } from "@/lib/founderMirror";
import { isArchetypeSuccess } from "@/lib/learningLoop";
import { scoreStructuredOutcome, parseOutcomeSignal } from "@/lib/outcomeSignal";
import { selectAgentEvidence } from "@/lib/agentToToday";

const NOW = new Date("2026-10-22T09:00:00.000Z");
const base = () => ({
  now: NOW,
  founderContext: { current_stage: "Validation", momentum_score: 50 },
  founderMemory: { strengths: [], avoidance_zones: [] },
  project: { name: "Flow", startup_stage: "Validation", problem: "invoices are slow", target_users: "freelancers" },
  milestones: [{ id: "m1", title: "Validate invoice pain", status: "in_progress", created_at: "2026-10-01T00:00:00.000Z", updated_at: "2026-10-10T00:00:00.000Z" }],
  tasks: [], reflections: [], activityEvents: [], actionLogs: [],
});

function resolvedRow(candidateId: string, kind: string, completed = true, trust: "verified" | "proof" | "self" = "verified") {
  const signal = { ...parseOutcomeSignal({ kind, count: kind === "none" ? 0 : 1 })!, trust };
  const score = scoreStructuredOutcome(completed, signal);
  return {
    id: `r-${Math.random()}`, user_id: "u", session_id: "", stage: "Validation", action_shown: "Message 3 freelancers on WhatsApp and ask how they chase unpaid invoices",
    prediction_source: "founder_intelligence", candidate_id: candidateId, outcome: completed ? "completed" : "pending",
    evidence_match_score: score, signal_kind: kind, created_at: "2026-10-15T00:00:00.000Z", outcome_recorded_at: "2026-10-15T01:00:00.000Z",
  };
}

describe("main flow", () => {
  it("Today: a confirmed Agent crew finding becomes the task, with its evidence attached", () => {
    const evidence = selectAgentEvidence([{
      id: "f1", title: "Freelancers chase invoices on WhatsApp", action_hint: "Message 3 freelancers on WhatsApp and ask how they chase unpaid invoices",
      confidence: 0.8, evidence_tier: "decision_grade", source_count: 3, verification_status: "founder_verified", founder_confirmed: true,
      confirmed_at: "2026-10-21T00:00:00.000Z",
    }], NOW);
    const state = buildFounderIntelligenceState({ ...base(), agentEvidence: evidence });
    const top = state.decision.top_candidate!;
    expect(top.id).toBe("agent_finding");
    expect(top.evidence?.title).toContain("WhatsApp");
  });

  it("Complete + report: a real signal is a success, 'nothing' is not", () => {
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.75, signal_kind: "reply" })).toBe(true);
    expect(isArchetypeSuccess({ outcome: "completed", evidence_match_score: 0.25, signal_kind: "none", evidence_references: [{}] })).toBe(false);
  });

  it("Learning: repeated 'nothing' outcomes pull an approach out of first place", () => {
    const failing = Array.from({ length: 4 }, () => resolvedRow("agent_finding", "none"));
    const evidence = selectAgentEvidence([{
      id: "f1", title: "Freelancers chase invoices on WhatsApp", action_hint: "Message 3 freelancers on WhatsApp and ask how they chase unpaid invoices",
      confidence: 0.8, evidence_tier: "supported", source_count: 2, verification_status: "founder_verified", founder_confirmed: true,
      confirmed_at: "2026-10-21T00:00:00.000Z",
    }], NOW);
    const state = buildFounderIntelligenceState({ ...base(), agentEvidence: evidence, learningLogs: failing as any });
    expect(state.archetype_stats.agent_finding.failures).toBe(4);
    expect(state.decision.top_candidate?.id).not.toBe("agent_finding");
  });

  it("Mirror: reports how outcomes were scored, honestly", () => {
    const state = buildFounderIntelligenceState({ ...base(), learningLogs: [resolvedRow("continue_best_next_task", "reply")] as any });
    const mirror = buildFounderMirror(state, { sample_size: 1, average_match_score: 0.75, last_updated_at: NOW.toISOString(), trend: "unknown", structured_count: 1 } as any);
    expect(mirror.self_reported_accuracy.summary.length).toBeGreaterThan(0);
    expect(mirror.self_reported_accuracy.summary).not.toMatch(/word overlap/i);
  });
});

describe("main flow: fake numbers do not train the ranking", () => {
  it("rows holding only a typed claim are ignored by the archetype stats", () => {
    const fake = Array.from({ length: 6 }, () => ({ ...resolvedRow("evidence_probe", "payment"), signal_trust: "self" }));
    const real = [{ ...resolvedRow("evidence_probe", "none"), signal_trust: "self" }];
    const state = buildFounderIntelligenceState({ ...base(), learningLogs: [...fake, ...real] as any });
    // six typed "payments" add nothing; the one honest "nothing" is the only evidence.
    expect(state.archetype_stats.evidence_probe).toMatchObject({ successes: 0, failures: 1 });
  });
  it("verified and proven rows still count", () => {
    const rows = [{ ...resolvedRow("evidence_probe", "signup", true, "verified"), signal_trust: "verified" }, { ...resolvedRow("evidence_probe", "reply", true, "proof"), signal_trust: "proof" }];
    const state = buildFounderIntelligenceState({ ...base(), learningLogs: rows as any });
    expect(state.archetype_stats.evidence_probe.successes).toBe(2);
  });
});
