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

import { stageBand, effectiveBand } from "@/lib/stages";

describe("stageBand", () => {
  it("maps every canonical stage to a band, Revenue sharing growth", () => {
    expect(["Idea", "Validation", "MVP", "Launch", "Growth", "Revenue"].map((s) => stageBand(s))).toEqual(["idea", "validation", "building", "launch", "growth", "growth"]);
  });
  it("understands older free-text stages", () => {
    expect(stageBand("First paying customers")).toBe("growth");
    expect(stageBand("Building the MVP")).toBe("building");
    expect(stageBand("Just an idea")).toBe("idea");
  });
  it("defaults to validation for anything unknown or empty, never to traction", () => {
    expect(stageBand("???")).toBe("validation");
    expect(stageBand(null)).toBe("validation");
  });
});

describe("effectiveBand", () => {
  it("plans Growth and Revenue founders with no users as Launch", () => {
    expect(effectiveBand("Growth", { noUsers: true })).toEqual({ band: "launch", adjusted: true });
    expect(effectiveBand("Revenue", { noUsers: true }).band).toBe("launch");
  });
  it("leaves MVP and Launch alone: no users is a normal state there", () => {
    expect(effectiveBand("MVP", { noUsers: true })).toEqual({ band: "building", adjusted: false });
    expect(effectiveBand("Launch", { noUsers: true })).toEqual({ band: "launch", adjusted: false });
  });
  it("changes nothing without the fact", () => {
    expect(effectiveBand("Growth")).toEqual({ band: "growth", adjusted: false });
  });
});

import { plainStage } from "@/lib/stages";

describe("plainStage", () => {
  it("says what each stage means in everyday words", () => {
    expect(plainStage("Validation")).toBe("Checking people want it");
    expect(plainStage("MVP", "short")).toBe("Build");
    expect(plainStage("mvp")).toBe("Building it");
  });
  it("returns an unknown value unchanged and an empty one as empty", () => {
    expect(plainStage("Pre-seed")).toBe("Pre-seed");
    expect(plainStage(null)).toBe("");
  });
});
