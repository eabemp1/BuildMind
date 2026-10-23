import { describe, it, expect } from "vitest";
import { selectAgentEvidence, agentCandidateTemplates, agentPromptBlock, agentRankingBoost, loadAgentEvidence, type AgentFindingRow } from "@/lib/agentToToday";
import { buildDecisionState } from "@/lib/founderIntelligence";

const now = new Date("2026-10-22T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();
const row = (o: Partial<AgentFindingRow>): AgentFindingRow => ({
  id: "aaaaaaaa-0000-0000-0000-000000000001", title: "Competitor X raised prices", action_hint: "Message 3 of their churned users on LinkedIn about why they left",
  confidence: 0.8, evidence_tier: "decision_grade", source_count: 3, verification_status: "founder_verified", founder_confirmed: true,
  confirmed_at: daysAgo(1), created_at: daysAgo(1), ...o,
});

describe("selectAgentEvidence", () => {
  it("surfaces a verified finding", () => {
    const r = selectAgentEvidence([row({})], now);
    expect(r.confirmed).toHaveLength(1);
    expect(r.recheck).toHaveLength(0);
    expect(r.key).not.toBe("");
  });
  it("ignores unreviewed and rejected findings", () => {
    expect(selectAgentEvidence([row({ founder_confirmed: null }), row({ id: "b", founder_confirmed: false, verification_status: "rejected" })], now).confirmed).toHaveLength(0);
  });
  it("ignores findings with no concrete action", () => {
    expect(selectAgentEvidence([row({ action_hint: "" })], now).confirmed).toHaveLength(0);
  });
  it("drops stale findings", () => {
    expect(selectAgentEvidence([row({ confirmed_at: daysAgo(40), created_at: daysAgo(40) })], now).confirmed).toHaveLength(0);
  });
  it("turns a single-source hypothesis into a re-check only after a few days", () => {
    const thin = { evidence_tier: "signal", source_count: 1, verification_status: "unverified_hypothesis" };
    expect(selectAgentEvidence([row({ ...thin, confirmed_at: daysAgo(1) })], now).recheck).toHaveLength(0);
    const later = selectAgentEvidence([row({ ...thin, confirmed_at: daysAgo(5) })], now);
    expect(later.recheck).toHaveLength(1);
    expect(later.confirmed).toHaveLength(0);
  });
  it("does not re-check a multi-source unverified finding", () => {
    expect(selectAgentEvidence([row({ evidence_tier: "signal", source_count: 3, verification_status: "unverified_hypothesis", confirmed_at: daysAgo(6) })], now).recheck).toHaveLength(0);
  });
  it("treats legacy rows without status by tier", () => {
    expect(selectAgentEvidence([row({ verification_status: null, evidence_tier: "supported" })], now).confirmed).toHaveLength(1);
    expect(selectAgentEvidence([row({ verification_status: null, evidence_tier: "signal", source_count: 0, confirmed_at: daysAgo(5) })], now).recheck).toHaveLength(1);
  });
  it("orders by tier then confidence and caps the list", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => row({ id: `id-${i}`, confidence: i / 10, evidence_tier: i === 5 ? "supported" : "decision_grade" }));
    const r = selectAgentEvidence(rows, now);
    expect(r.confirmed).toHaveLength(3);
    expect(r.confirmed[0].finding_id).toBe("id-4");
  });
});

describe("candidates, boost and prompt", () => {
  it("builds one candidate per kind with the evidence attached", () => {
    const ev = selectAgentEvidence([row({}), row({ id: "r1", evidence_tier: "signal", source_count: 1, verification_status: "unverified_hypothesis", confirmed_at: daysAgo(6) })], now);
    const t = agentCandidateTemplates(ev);
    expect(t.map((x) => x.id)).toEqual(["agent_finding", "agent_recheck"]);
    expect(t[0].evidence.title).toContain("Competitor X");
    expect(t[0].action.endsWith(".")).toBe(true);
    expect(agentCandidateTemplates(null)).toEqual([]);
  });
  it("boosts verified tiers, never re-checks", () => {
    expect(agentRankingBoost({ kind: "confirmed", tier: "decision_grade" })).toBeGreaterThan(agentRankingBoost({ kind: "confirmed", tier: "supported" }));
    expect(agentRankingBoost({ kind: "recheck", tier: "signal" })).toBe(0);
  });
  it("prompt block is empty without evidence and flags re-checks", () => {
    expect(agentPromptBlock(null)).toBe("");
    const ev = selectAgentEvidence([row({ id: "r1", evidence_tier: "signal", source_count: 0, verification_status: "unverified_hypothesis", confirmed_at: daysAgo(6) })], now);
    expect(agentPromptBlock(ev)).toContain("NEEDS RE-CHECK");
  });
});

describe("loadAgentEvidence", () => {
  it("returns empty on errors", async () => {
    const sb = { from: () => { throw new Error("boom"); } };
    expect((await loadAgentEvidence(sb, "u", "p", now)).key).toBe("");
  });
  it("returns empty without a project", async () => {
    expect((await loadAgentEvidence({ from: () => ({}) }, "u", null, now)).confirmed).toEqual([]);
  });
});

describe("decision ranking", () => {
  it("lets a verified decision-grade finding become a ranked candidate with evidence", () => {
    const ev = selectAgentEvidence([row({})], now);
    const base: any = {
      execution_state: {}, founder: { avoidance_patterns: [], strengths: [] }, startup: { assumptions: [], current_goal: "Validate pricing" },
      strategy: {}, execution: { repeated_actions: [], execution_velocity: 60 }, temporal: {}, signals: [], archetype_stats: {},
      generated_at: now.toISOString(), agent_evidence: ev, decision: { candidates: [], top_candidate: null, decision_basis: [] },
    };
    const d = buildDecisionState(base);
    const c = d.candidates.find((x) => x.id === "agent_finding");
    expect(c?.evidence?.finding_id).toBe(ev.confirmed[0].finding_id);
    expect(d.top_candidate?.id).toBe("agent_finding");
  });
});
