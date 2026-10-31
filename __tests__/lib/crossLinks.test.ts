import { describe, it, expect } from "vitest";
import { pickCrossLink, type CrossLinkInput } from "@/lib/today/crossLinks";

const base: CrossLinkInput = { tasksCompleted: 1, outcome: "completed", band: "validation", breakAgeDays: null, hasAgentRun: false, startup: "Nevrix", seen: {}, today: "2026-10-31" };

describe("Today cross links", () => {
  it("points a founder who has never run a teardown to Break My Startup after a finished task", () => {
    expect(pickCrossLink(base)?.id).toBe("break");
    expect(pickCrossLink(base)?.text).toContain("Nevrix");
  });
  it("uses the blocked wording when the task was blocked", () => {
    expect(pickCrossLink({ ...base, outcome: "blocked" })?.id).toBe("break_blocked");
  });
  it("says nothing before anything is finished", () => {
    expect(pickCrossLink({ ...base, tasksCompleted: 0 })).toBeNull();
  });
  it("shows at most one suggestion a day", () => {
    expect(pickCrossLink({ ...base, seen: { validate: "2026-10-31" } })).toBeNull();
  });
  it("shows each suggestion once", () => {
    expect(pickCrossLink({ ...base, seen: { break: "2026-10-30" }, tasksCompleted: 1 })).toBeNull();
    expect(pickCrossLink({ ...base, seen: { break: "2026-10-30" }, tasksCompleted: 2 })?.id).toBe("validate");
  });
  it("offers a re-run after a week, then not again for two weeks", () => {
    const a = pickCrossLink({ ...base, breakAgeDays: 8, hasAgentRun: true });
    expect(a?.id).toBe("break_rerun");
    expect(pickCrossLink({ ...base, breakAgeDays: 9, hasAgentRun: true, seen: { break_rerun: "2026-10-25" } })).toBeNull();
    expect(pickCrossLink({ ...base, breakAgeDays: 20, hasAgentRun: true, seen: { break_rerun: "2026-10-10" } })?.id).toBe("break_rerun");
  });
  it("does not push a recent teardown or a validation check on later-stage founders", () => {
    expect(pickCrossLink({ ...base, breakAgeDays: 2, tasksCompleted: 3 })?.id).toBe("validate");
    expect(pickCrossLink({ ...base, breakAgeDays: 2, band: "growth", tasksCompleted: 3 })).toBeNull();
    expect(pickCrossLink({ ...base, breakAgeDays: 2, hasAgentRun: true, tasksCompleted: 3 })).toBeNull();
  });
});
