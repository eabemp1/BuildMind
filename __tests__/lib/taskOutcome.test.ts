import { describe, it, expect } from "vitest";
import { countsAsDone, taskStripLabel } from "@/lib/taskOutcome";

describe("what counts as work done", () => {
  it("blocked, skipped and abandoned do not", () => {
    for (const o of ["blocked", "skipped", "abandoned"]) expect(countsAsDone(o)).toBe(false);
  });
  it("completed, partial and learned do", () => {
    for (const o of ["completed", "partial", "learned"]) expect(countsAsDone(o)).toBe(true);
  });
  it("an old client that sends nothing still counts as completed", () => expect(countsAsDone(undefined)).toBe(true));
});

describe("the status strip tells the truth about today's task", () => {
  it("says blocked, not done, after a blocked check-in", () => {
    expect(taskStripLabel(true, "blocked")).toBe("blocked");
    expect(taskStripLabel(true, "completed")).toBe("done");
    expect(taskStripLabel(true, "partial")).toBe("partly done");
    expect(taskStripLabel(false, null)).toBe("not yet");
  });
  it("says 'checked in' when the outcome is not known on this device", () => expect(taskStripLabel(true, null)).toBe("checked in"));
});
