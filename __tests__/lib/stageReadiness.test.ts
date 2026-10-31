import { describe, it, expect } from "vitest";
import { computeStageReadiness } from "@/lib/server/stageReadiness";
import type { StageProgress } from "@/lib/server/stageProgress";

const done: StageProgress = { stage: "Idea", totalMilestones: 2, completedMilestones: 2, percent: 100, isComplete: true, remainingTitles: [], totalTasks: 6, completedTasks: 6, taskPercent: 100 };
const base = { stageProgress: done, nextStage: "Validation", reflectionCount: 4, avgConfidence: 4.2, overrides: 0 };

describe("stage readiness gate", () => {
  it("two opinions are not evidence: the checklist counts but the tier stays checklist_only", () => {
    const r = computeStageReadiness({ ...base, evidenceRows: [{ evidence_type: "founder_judgment" }, { evidence_type: "founder_judgment" }] });
    expect(r.evidence?.filledSlots).toBe(2);
    expect(r.evidence?.hasHardEvidence).toBe(false);
    expect(r.tier).toBe("checklist_only");
    expect(r.detail).toMatch(/only your own judgment/i);
  });

  it("one real document plus one judgment clears the evidence bar", () => {
    const r = computeStageReadiness({ ...base, evidenceRows: [{ evidence_type: "artifact" }, { evidence_type: "founder_judgment" }] });
    expect(r.evidence?.meetsBar).toBe(true);
    expect(r.tier).toBe("ready");
  });

  it("one piece of evidence is never enough on its own", () => {
    const r = computeStageReadiness({ ...base, evidenceRows: [{ evidence_type: "artifact" }] });
    expect(r.evidence?.meetsBar).toBe(false);
    expect(r.tier).toBe("checklist_only");
  });

  it("milestones not finished is not_ready whatever the evidence", () => {
    const r = computeStageReadiness({ ...base, stageProgress: { ...done, isComplete: false, completedMilestones: 1 }, evidenceRows: [{ evidence_type: "artifact" }, { evidence_type: "founder_judgment" }] });
    expect(r.tier).toBe("not_ready");
  });
});
