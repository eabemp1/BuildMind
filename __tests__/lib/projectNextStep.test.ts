import { describe, it, expect } from "vitest";
import { nextStepFor } from "@/lib/projects/nextStep";

describe("nextStepFor", () => {
  it("shows the first pending task", () => {
    expect(nextStepFor({ tasksTotal: 3, tasksCompleted: 1, pendingTasks: ["", "  Call two shop owners  ", "x"] })).toEqual({ kind: "task", text: "Call two shop owners" });
  });
  it("says done when every task is done", () => {
    expect(nextStepFor({ tasksTotal: 4, tasksCompleted: 4, pendingTasks: [] }).kind).toBe("done");
  });
  it("says to get started when there are no tasks", () => {
    expect(nextStepFor({ tasksTotal: 0, tasksCompleted: 0 }).kind).toBe("empty");
  });
});
