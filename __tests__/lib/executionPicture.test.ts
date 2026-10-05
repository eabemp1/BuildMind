import { describe, it, expect } from "vitest";
import { buildExecutionPicture } from "@/lib/executionPicture";

const base = { stage: "MVP", readinessTier: "not_ready" as const, tasksTotal: 10, tasksDone: 6, milestonesCompleted: 1, streak: 3, todayDone: false, daysSinceReflection: 1, scoreDelta: 2 };

describe("buildExecutionPicture", () => {
  it("says nothing is wrong when nothing is wrong", () => {
    const p = buildExecutionPicture(base);
    expect(p.watch).toEqual([]);
    expect(p.verdict).toMatch(/On track/);
  });
  it("never repeats the same warning", () => {
    const p = buildExecutionPicture({ ...base, daysSinceReflection: 5, tasksDone: 1, scoreDelta: -12 });
    expect(new Set(p.watch).size).toBe(p.watch.length);
    expect(p.tone).toBe("risk");
  });
  it("reports readiness tier consistently", () => {
    expect(buildExecutionPicture({ ...base, readinessTier: "checklist_only" }).verdict).toMatch(/evidence still thin/);
    expect(buildExecutionPicture({ ...base, readinessTier: "ready" }).tone).toBe("good");
  });
  it("flags a streak ending tonight only when today is not done", () => {
    expect(buildExecutionPicture({ ...base, streakAtRisk: true }).watch[0]).toMatch(/ends tonight/);
    expect(buildExecutionPicture({ ...base, streakAtRisk: true, todayDone: true }).watch).toEqual([]);
  });
  it("mentions a lapsed streak honestly", () => {
    expect(buildExecutionPicture({ ...base, streak: 0, lastStreak: 9 }).watch[0]).toMatch(/9-day streak lapsed/);
  });
  it("prefers a concrete task for the next move", () => {
    expect(buildExecutionPicture({ ...base, nextTask: "Email 5 users" }).nextMove.label).toBe("Email 5 users");
  });
  it("handles a brand-new project", () => {
    const p = buildExecutionPicture({ ...base, tasksDone: 0, milestonesCompleted: 0, streak: 0 });
    expect(p.verdict).toBe("Not started yet");
  });
});
