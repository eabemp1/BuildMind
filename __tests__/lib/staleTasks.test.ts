import { describe, expect, it } from "vitest";
import { isStaleOpenTask, completionTime, STALE_TASK_DAYS } from "@/lib/staleTasks";

const now = new Date("2026-10-24T12:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

describe("isStaleOpenTask", () => {
  it("flags an open task untouched for 30+ days", () => {
    expect(isStaleOpenTask({ is_completed: false, created_at: ago(160), updated_at: ago(160) }, now)).toBe(true);
    expect(isStaleOpenTask({ is_completed: false, updated_at: ago(STALE_TASK_DAYS) }, now)).toBe(true);
  });
  it("keeps a recently touched task live", () => {
    expect(isStaleOpenTask({ is_completed: false, created_at: ago(160), updated_at: ago(3) }, now)).toBe(false);
    expect(isStaleOpenTask({ is_completed: false, created_at: ago(29) }, now)).toBe(false);
  });
  it("never calls a finished task stale", () => {
    expect(isStaleOpenTask({ is_completed: true, created_at: ago(200) }, now)).toBe(false);
    expect(isStaleOpenTask({ status: "completed", created_at: ago(200) }, now)).toBe(false);
  });
  it("never guesses when there is no timestamp or it is invalid", () => {
    expect(isStaleOpenTask({ is_completed: false }, now)).toBe(false);
    expect(isStaleOpenTask({ is_completed: false, created_at: "not a date" }, now)).toBe(false);
  });
});

describe("completionTime", () => {
  it("prefers completed_at over a later edit", () => {
    expect(completionTime({ is_completed: true, completed_at: ago(10), updated_at: ago(1) })).toBe(new Date(ago(10)).getTime());
  });
  it("falls back to the last touch when completed_at is missing (the old bug)", () => {
    expect(completionTime({ is_completed: true, completed_at: null, updated_at: ago(2) })).toBe(new Date(ago(2)).getTime());
  });
  it("is null for an open task", () => {
    expect(completionTime({ is_completed: false, updated_at: ago(2) })).toBeNull();
  });
});
