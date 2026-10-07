import { describe, it, expect } from "vitest";
import { computeCompleteness } from "@/lib/profileCompleteness";

describe("computeCompleteness", () => {
  it("reaches 100 when every input is present (no unreachable items)", () => {
    const { score } = computeCompleteness({
      startupSummary: "A tool that helps shop owners track what customers owe them",
      displayName: "Ama", stage: "Validation", targetUsers: "shop owners in Kumasi",
      avoidanceZones: ["pricing"], mrr: 100, tasksCompleted: 3,
    });
    expect(score).toBe(100);
  });
  it("same inputs always give the same score; missing inputs lower it", () => {
    const full = computeCompleteness({ startupSummary: "x".repeat(30), tasksCompleted: 1 }).score;
    expect(computeCompleteness({ startupSummary: "x".repeat(30), tasksCompleted: 1 }).score).toBe(full);
    expect(computeCompleteness({}).score).toBe(0);
    expect(full).toBeGreaterThan(0);
  });
});
