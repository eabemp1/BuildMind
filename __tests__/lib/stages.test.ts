/**
 * __tests__/lib/stages.test.ts
 *
 * Unit tests for lib/stages/index.ts
 * Pure functions — no mocking, no DB, no network.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeStage,
  inferStageFromMilestones,
  stageRank,
  STAGE_ORDER,
} from "../../lib/stages";

// ─── normalizeStage ───────────────────────────────────────────────────────

describe("normalizeStage", () => {
  const cases: [string | null | undefined, string][] = [
    ["Idea",        "Idea"],
    ["idea",        "Idea"],
    ["",            "Idea"],
    [null,          "Idea"],
    [undefined,     "Idea"],
    ["Validation",  "Validation"],
    ["validation",  "Validation"],
    ["discovery",   "Validation"],   // contains "valid"? no — but "discover" maps to Validation
    ["MVP",         "MVP"],
    ["mvp",         "MVP"],
    ["Prototype",   "MVP"],
    ["prototype",   "MVP"],
    ["Launch",      "Launch"],
    ["launch",      "Launch"],
    ["Growth",      "Growth"],
    ["growth",      "Growth"],
    ["Revenue",     "Revenue"],
    ["revenue",     "Revenue"],
  ];

  it.each(cases)("normalizeStage(%s) → %s", (input, expected) => {
    expect(normalizeStage(input)).toBe(expected);
  });
});

// ─── stageRank ────────────────────────────────────────────────────────────

describe("stageRank", () => {
  it("returns increasing ranks for each stage in order", () => {
    const ranks = STAGE_ORDER.map(stageRank);
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeGreaterThan(ranks[i - 1]);
    }
  });

  it("Idea < Revenue", () => {
    expect(stageRank("Idea")).toBeLessThan(stageRank("Revenue"));
  });
});

// ─── inferStageFromMilestones ─────────────────────────────────────────────

describe("inferStageFromMilestones", () => {
  it("returns Idea when no milestones", () => {
    expect(inferStageFromMilestones([], [], new Map())).toBe("Idea");
  });

  it("returns Idea when no milestones are complete", () => {
    const milestones = [
      { title: "Idea", is_completed: false, order_index: 0 },
      { title: "Validation", is_completed: false, order_index: 1 },
    ];
    expect(inferStageFromMilestones(milestones, [], new Map())).toBe("Idea");
  });

  it("advances to next stage when first milestone is complete", () => {
    const milestones = [
      { title: "Idea milestone", is_completed: true,  order_index: 0 },
      { title: "Validation milestone", is_completed: false, order_index: 1 },
      { title: "MVP milestone", is_completed: false, order_index: 2 },
    ];
    const result = inferStageFromMilestones(milestones, [], new Map());
    expect(result).toBe("Validation");
  });

  it("returns Revenue when all milestones are complete", () => {
    const milestones = [
      { title: "Idea", is_completed: true, order_index: 0 },
      { title: "Validation", is_completed: true, order_index: 1 },
      { title: "MVP", is_completed: true, order_index: 2 },
    ];
    expect(inferStageFromMilestones(milestones, [], new Map())).toBe("Revenue");
  });

  it("marks milestone complete when all its tasks are done", () => {
    const milestones = [
      { title: "Idea", is_completed: false, order_index: 0 },
      { title: "Validation", is_completed: false, order_index: 1 },
    ];
    // milestone "m-idea" has two tasks, both complete
    const milestoneIdMap = new Map([["m-idea", "Idea"]]);
    const tasks = [
      { milestone_id: "m-idea", is_completed: true },
      { milestone_id: "m-idea", is_completed: true },
    ];
    const result = inferStageFromMilestones(milestones, tasks, milestoneIdMap);
    expect(result).toBe("Validation");
  });

  it("does NOT mark milestone complete when only some tasks are done", () => {
    const milestones = [
      { title: "Idea", is_completed: false, order_index: 0 },
      { title: "Validation", is_completed: false, order_index: 1 },
    ];
    const milestoneIdMap = new Map([["m-idea", "Idea"]]);
    const tasks = [
      { milestone_id: "m-idea", is_completed: true },
      { milestone_id: "m-idea", is_completed: false }, // incomplete
    ];
    const result = inferStageFromMilestones(milestones, tasks, milestoneIdMap);
    expect(result).toBe("Idea"); // still at Idea
  });

  it("is_completed=true on milestone overrides task check", () => {
    const milestones = [
      { title: "Idea", is_completed: true, order_index: 0 }, // completed even if no tasks
      { title: "Validation", is_completed: false, order_index: 1 },
    ];
    const result = inferStageFromMilestones(milestones, [], new Map());
    expect(result).toBe("Validation");
  });

  it("handles out-of-order milestones by sorting on order_index", () => {
    const milestones = [
      { title: "MVP", is_completed: false, order_index: 2 },
      { title: "Idea", is_completed: true,  order_index: 0 },
      { title: "Validation", is_completed: false, order_index: 1 },
    ];
    const result = inferStageFromMilestones(milestones, [], new Map());
    expect(result).toBe("Validation"); // next after Idea (index 0)
  });

  it("skips gaps — reports stage after highest completed milestone", () => {
    const milestones = [
      { title: "Idea",       is_completed: true,  order_index: 0 },
      { title: "Validation", is_completed: false, order_index: 1 },
      { title: "MVP",        is_completed: true,  order_index: 2 }, // gap complete
      { title: "Launch",     is_completed: false, order_index: 3 },
    ];
    const result = inferStageFromMilestones(milestones, [], new Map());
    // last complete = index 2 (MVP), next = index 3 (Launch)
    expect(result).toBe("Launch");
  });
});
