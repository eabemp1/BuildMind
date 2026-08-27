import { describe, expect, it } from "vitest";
import { findStaleGoal, monthStart, type MilestoneActivityInput } from "../../lib/monthlyReckoning";

const NOW = new Date("2026-08-26T12:00:00.000Z");

function milestone(overrides: Partial<MilestoneActivityInput> = {}): MilestoneActivityInput {
  return {
    id: "m1",
    title: "Validate consent pain",
    status: "in_progress",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    lastTaskCompletedAt: null,
    ...overrides,
  };
}

describe("findStaleGoal", () => {
  it("returns null when there are no milestones", () => {
    expect(findStaleGoal([], NOW)).toBeNull();
  });

  it("does not flag a completed milestone as stale", () => {
    const result = findStaleGoal([milestone({ status: "completed" })], NOW);
    expect(result).toBeNull();
  });

  it("does not flag an already-abandoned milestone", () => {
    const result = findStaleGoal([milestone({ status: "abandoned" })], NOW);
    expect(result).toBeNull();
  });

  it("does not flag a goal created recently, even with no activity", () => {
    const result = findStaleGoal(
      [milestone({ createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" })],
      NOW,
    );
    expect(result).toBeNull();
  });

  it("does not flag a goal with recent task activity, even if it's old", () => {
    const result = findStaleGoal(
      [milestone({
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        lastTaskCompletedAt: "2026-08-20T00:00:00.000Z", // 6 days ago
      })],
      NOW,
    );
    expect(result).toBeNull();
  });

  it("flags a goal that is old AND has had no activity in 21+ days", () => {
    const result = findStaleGoal(
      [milestone({
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z",
        lastTaskCompletedAt: null,
      })],
      NOW,
    );
    expect(result).not.toBeNull();
    expect(result?.id).toBe("m1");
    expect(result?.daysSinceActivity).toBeGreaterThanOrEqual(21);
  });

  it("falls back to updated_at for activity when there are no completed tasks at all", () => {
    const result = findStaleGoal(
      [milestone({
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z", // touched more recently than created, still 21+ days ago
        lastTaskCompletedAt: null,
      })],
      NOW,
    );
    expect(result).not.toBeNull();
    // daysSinceActivity should be measured from updatedAt (2026-07-01), not createdAt.
    expect(result?.daysSinceActivity).toBe(56);
  });

  it("picks the single MOST stale goal when multiple qualify", () => {
    const older = milestone({ id: "old", title: "Old goal", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    const lessOld = milestone({ id: "less-old", title: "Less old goal", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-01T00:00:00.000Z" });
    const result = findStaleGoal([lessOld, older], NOW);
    expect(result?.id).toBe("old");
  });

  it("respects a custom staleDaysThreshold", () => {
    const recentish = milestone({
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    }); // ~25 days old at NOW
    expect(findStaleGoal([recentish], NOW, 21)).not.toBeNull();
    expect(findStaleGoal([recentish], NOW, 30)).toBeNull();
  });
});

describe("monthStart", () => {
  it("returns the 1st of the month for a mid-month date", () => {
    expect(monthStart(new Date("2026-08-26T12:00:00.000Z"))).toBe("2026-08-01");
  });

  it("returns the 1st of the month when given the 1st itself", () => {
    expect(monthStart(new Date("2026-08-01T00:00:00.000Z"))).toBe("2026-08-01");
  });

  it("handles year rollover correctly", () => {
    expect(monthStart(new Date("2026-12-31T23:59:59.000Z"))).toBe("2026-12-01");
  });
});
