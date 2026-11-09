import { describe, it, expect } from "vitest";
import { computeStageProgress, isMilestoneDone } from "@/lib/server/stageProgress";
import { nextMilestoneStatus } from "@/lib/server/milestoneSync";

const m = (id: string, status: string, stage = "Validation") => ({ id, title: id, status, stage });

describe("milestone completion comes from the tasks", () => {
  it("is done when every task is done, even if the stored status was never updated", () => {
    expect(isMilestoneDone(m("a", "in_progress"), [{ milestone_id: "a", is_completed: true }, { milestone_id: "a", is_completed: true }])).toBe(true);
  });
  it("is not done when a task was reopened, even if the stored status still says completed", () => {
    expect(isMilestoneDone(m("a", "completed"), [{ milestone_id: "a", is_completed: true }, { milestone_id: "a", is_completed: false }])).toBe(false);
  });
  it("falls back to status when the milestone has no tasks", () => {
    expect(isMilestoneDone(m("a", "completed"), [])).toBe(true);
    expect(isMilestoneDone(m("a", "pending"), [{ milestone_id: "other", is_completed: true }])).toBe(false);
  });
  it("completes a stage after real work that never touched the status column", () => {
    const p = computeStageProgress([m("a", "in_progress"), m("b", "in_progress")], "Validation", [
      { milestone_id: "a", is_completed: true }, { milestone_id: "b", is_completed: true },
    ]);
    expect(p.isComplete).toBe(true);
    expect(p.percent).toBe(100);
  });
  it("un-completes a stage when a task is reopened", () => {
    const p = computeStageProgress([m("a", "completed"), m("b", "completed")], "Validation", [
      { milestone_id: "a", is_completed: true }, { milestone_id: "b", is_completed: false },
    ]);
    expect(p.isComplete).toBe(false);
    expect(p.remainingTitles).toEqual(["b"]);
  });
});

describe("nextMilestoneStatus", () => {
  it("completes, reopens, or leaves alone", () => {
    expect(nextMilestoneStatus([{ is_completed: true }], "in_progress")).toBe("completed");
    expect(nextMilestoneStatus([{ is_completed: true }], "completed")).toBeNull();
    expect(nextMilestoneStatus([{ is_completed: true }, { is_completed: false }], "completed")).toBe("in_progress");
    expect(nextMilestoneStatus([{ is_completed: false }], "pending")).toBeNull();
    expect(nextMilestoneStatus([], "completed")).toBeNull();
  });
});
