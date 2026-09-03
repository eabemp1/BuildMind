/**
 * __tests__/lib/stageEvidence.test.ts
 *
 * Unit tests for lib/server/stageEvidence.ts — pure functions, no mocks.
 * Covers both decisions this file implements:
 *   1. The closed 4-type evidence vocabulary (validateStageEvidenceInput)
 *   2. All five forward transitions are fully built, each with its own
 *      requirement spec and its own 4 distinct slots — not a copy of
 *      Launch -> Growth reused everywhere.
 */
import { describe, it, expect } from "vitest";
import {
  getStageEvidenceRequirement,
  computeStageEvidenceCompleteness,
  validateStageEvidenceInput,
  STAGE_EVIDENCE_TYPES,
} from "@/lib/server/stageEvidence";

describe("getStageEvidenceRequirement — every forward transition is built", () => {
  it("returns a real, 4-slot requirement for every forward transition", () => {
    const pairs: [string, string][] = [
      ["Idea", "Validation"],
      ["Validation", "MVP"],
      ["MVP", "Launch"],
      ["Launch", "Growth"],
      ["Growth", "Revenue"],
    ];
    for (const [from, to] of pairs) {
      const req = getStageEvidenceRequirement(from, to);
      expect(req, `${from} -> ${to} should have a requirement`).not.toBeNull();
      expect(req?.toStage).toBe(to);
      expect(req?.slots).toHaveLength(4);
      // every slot has real copy, not placeholder text
      for (const slot of req!.slots) {
        expect(slot.label.length).toBeGreaterThan(5);
        expect(slot.helpText.length).toBeGreaterThan(10);
        expect(slot.acceptedTypes.length).toBeGreaterThan(0);
      }
    }
  });

  it("each transition's slots are genuinely distinct, not a reused template", () => {
    const toStages = ["Validation", "MVP", "Launch", "Growth", "Revenue"];
    const fromStages = ["Idea", "Validation", "MVP", "Launch", "Growth"];
    const slotKeySets = toStages.map((to, i) =>
      getStageEvidenceRequirement(fromStages[i], to)!.slots.map(s => s.key).sort().join(","),
    );
    // no two transitions should have the identical slot-key set
    expect(new Set(slotKeySets).size).toBe(slotKeySets.length);
  });

  it("skipping stages still resolves the target stage's requirement, keyed by destination", () => {
    // founder picks MVP directly from Idea — same requirement as Validation -> MVP
    const skipped = getStageEvidenceRequirement("Idea", "MVP");
    const adjacent = getStageEvidenceRequirement("Validation", "MVP");
    expect(skipped?.toStage).toBe(adjacent?.toStage);
    expect(skipped?.slots.map(s => s.key)).toEqual(adjacent?.slots.map(s => s.key));
  });

  it("returns null for a backward move — that stays an unreviewed override", () => {
    expect(getStageEvidenceRequirement("Growth", "Launch")).toBeNull();
    expect(getStageEvidenceRequirement("Revenue", "Idea")).toBeNull();
  });

  it("returns null for a no-op (same stage)", () => {
    expect(getStageEvidenceRequirement("Launch", "Launch")).toBeNull();
  });

  it("returns null for an unrecognized stage string", () => {
    expect(getStageEvidenceRequirement("Idea", "Nonsense")).toBeNull();
  });
});

describe("computeStageEvidenceCompleteness — works identically across transitions", () => {
  it("is complete once one row of each of the 4 types is present, for any transition", () => {
    for (const [from, to] of [["Idea", "Validation"], ["Growth", "Revenue"]] as const) {
      const req = getStageEvidenceRequirement(from, to)!;
      const result = computeStageEvidenceCompleteness(req, [
        { evidence_type: "metric" },
        { evidence_type: "artifact" },
        { evidence_type: "experiment" },
        { evidence_type: "founder_judgment" },
      ]);
      expect(result.isComplete, `${from} -> ${to}`).toBe(true);
    }
  });

  it("is incomplete with no rows", () => {
    const req = getStageEvidenceRequirement("MVP", "Launch")!;
    const result = computeStageEvidenceCompleteness(req, []);
    expect(result.isComplete).toBe(false);
    expect(result.missingSlotKeys).toHaveLength(4);
  });

  it("Launch -> Growth: an artifact + a metric fill exposure and result but not channel/confirmation", () => {
    const req = getStageEvidenceRequirement("Launch", "Growth")!;
    const result = computeStageEvidenceCompleteness(req, [
      { evidence_type: "artifact" },
      { evidence_type: "metric" },
    ]);
    expect(result.filledSlotKeys).toContain("real_user_exposure");
    expect(result.filledSlotKeys).toContain("measurable_result");
    expect(result.missingSlotKeys).toContain("channel_attempt");
    expect(result.missingSlotKeys).toContain("growth_confirmation");
  });
});

describe("validateStageEvidenceInput — closed type set, same rules for every transition", () => {
  it("rejects a type outside the closed set", () => {
    expect(validateStageEvidenceInput({ evidence_type: "vibes" })).toMatch(/must be one of/);
  });

  it("accepts exactly the 4 documented types and nothing else", () => {
    expect(STAGE_EVIDENCE_TYPES).toEqual(["metric", "artifact", "experiment", "founder_judgment"]);
  });

  it("requires metric_name and metric_value for a metric row", () => {
    expect(validateStageEvidenceInput({ evidence_type: "metric" })).toMatch(/metric_name and metric_value/);
    expect(validateStageEvidenceInput({ evidence_type: "metric", metric_name: "signups", metric_value: "42" })).toBeNull();
  });

  it("requires artifact_description for an artifact row", () => {
    expect(validateStageEvidenceInput({ evidence_type: "artifact" })).toMatch(/artifact_description/);
    expect(validateStageEvidenceInput({ evidence_type: "artifact", artifact_description: "5 beta users onboarded" })).toBeNull();
  });

  it("requires experiment_channel and experiment_outcome for an experiment row", () => {
    expect(validateStageEvidenceInput({ evidence_type: "experiment" })).toMatch(/experiment_channel and experiment_outcome/);
    expect(
      validateStageEvidenceInput({ evidence_type: "experiment", experiment_channel: "cold email", experiment_outcome: "3 replies, 1 demo booked" }),
    ).toBeNull();
  });

  it("requires judgment_text for a founder_judgment row", () => {
    expect(validateStageEvidenceInput({ evidence_type: "founder_judgment" })).toMatch(/judgment_text/);
    expect(validateStageEvidenceInput({ evidence_type: "founder_judgment", judgment_text: "Distribution is now the bottleneck, not the product." })).toBeNull();
  });
});
