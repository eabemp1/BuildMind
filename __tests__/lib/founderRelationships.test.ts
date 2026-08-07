import { describe, expect, it } from "vitest";
import { buildFounderIntelligenceState, type FounderIntelligenceInput } from "../../lib/founderIntelligence";
import { buildStartupRelationshipGraph, traceRelationshipChain } from "../../lib/founderRelationships";

const NOW = new Date("2026-08-05T12:00:00.000Z");

function input(overrides: Partial<FounderIntelligenceInput> = {}): FounderIntelligenceInput {
  return {
    now: NOW,
    founderContext: { current_stage: "Validation", momentum_score: 50, avoidance_zones: [] },
    founderMemory: { strengths: [], avoidance_zones: [] },
    project: { name: "ConsentFlow", startup_stage: "Validation", problem: "consent tracking is painful", target_users: "privacy officers" },
    milestones: [
      { id: "m1", title: "Validate consent pain", status: "in_progress", created_at: "2026-07-20T00:00:00.000Z", updated_at: "2026-07-24T00:00:00.000Z" },
    ],
    tasks: [
      { id: "t1", milestone_id: "m1", title: "Interview privacy officers", status: "pending", is_completed: false, created_at: "2026-07-15T00:00:00.000Z", updated_at: "2026-07-30T00:00:00.000Z" },
    ],
    reflections: [
      { today_action: "Interview privacy officers", outcome: "completed", note: "Talked to a privacy officer, they confirmed the pain and asked about pricing", what_learned: "Users care about audit trails", created_at: "2026-08-01T10:00:00.000Z" },
    ],
    learningLogs: [],
    activityEvents: [],
    actionLogs: [],
    ...overrides,
  };
}

describe("founderRelationships: buildStartupRelationshipGraph", () => {
  it("links milestone -> task via existing tasks.milestone_id, without a new schema", () => {
    const state = buildFounderIntelligenceState(input());
    const graph = buildStartupRelationshipGraph(input(), state);

    const milestoneNode = graph.nodes.find((n) => n.type === "milestone");
    const taskNode = graph.nodes.find((n) => n.type === "task");
    expect(milestoneNode).toBeDefined();
    expect(taskNode).toBeDefined();
    expect(graph.edges).toContainEqual({ from: milestoneNode!.id, to: taskNode!.id, relation: "contains_task" });
  });

  it("chains task -> action -> outcome -> evidence when a reflection matches the task", () => {
    const state = buildFounderIntelligenceState(input());
    const graph = buildStartupRelationshipGraph(input(), state);

    const evidenceNode = graph.nodes.find((n) => n.type === "evidence");
    expect(evidenceNode).toBeDefined();
    expect(evidenceNode!.label).toContain("audit trails");
  });

  it("includes assumption nodes derived from project problem/target_users", () => {
    const state = buildFounderIntelligenceState(input());
    const graph = buildStartupRelationshipGraph(input(), state);
    const assumptionLabels = graph.nodes.filter((n) => n.type === "assumption").map((n) => n.label);
    expect(assumptionLabels.some((l) => l.includes("consent tracking"))).toBe(true);
    expect(assumptionLabels.some((l) => l.includes("privacy officers"))).toBe(true);
  });

  it("includes the deterministic top decision candidate as a decision node", () => {
    const state = buildFounderIntelligenceState(input());
    const graph = buildStartupRelationshipGraph(input(), state);
    const decisionNode = graph.nodes.find((n) => n.type === "decision");
    expect(decisionNode?.label).toBe(state.decision.top_candidate?.action);
  });
});

describe("founderRelationships: traceRelationshipChain", () => {
  it("produces a readable evidence trail from milestone to evidence", () => {
    const state = buildFounderIntelligenceState(input());
    const graph = buildStartupRelationshipGraph(input(), state);
    const chain = traceRelationshipChain(graph, "Validate consent pain");

    expect(chain.milestone?.label).toBe("Validate consent pain");
    expect(chain.narrative).toContain("milestone(");
    expect(chain.path.some((n) => n.type === "evidence")).toBe(true);
  });

  it("returns an empty chain gracefully when there is no milestone data", () => {
    const emptyInput = input({ milestones: [], tasks: [] });
    const state = buildFounderIntelligenceState(emptyInput);
    const graph = buildStartupRelationshipGraph(emptyInput, state);
    const chain = traceRelationshipChain(graph);
    expect(chain.milestone).toBeNull();
    expect(chain.path).toEqual([]);
  });
});
