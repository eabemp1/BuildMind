import { describe, it, expect } from "vitest";
import { streakStatus, effectiveStreak, streakFromDays, daysSinceActive } from "@/lib/streak";

describe("streakStatus", () => {
  it("keeps a streak extended today", () => {
    expect(streakStatus(5, "2026-10-05", "2026-10-05")).toMatchObject({ count: 5, doneToday: true, atRisk: false });
  });
  it("keeps a streak from yesterday but flags risk", () => {
    expect(streakStatus(5, "2026-10-04", "2026-10-05")).toMatchObject({ count: 5, doneToday: false, atRisk: true });
  });
  it("lapses after a missed day", () => {
    const s = streakStatus(12, "2026-10-01", "2026-10-05");
    expect(s.count).toBe(0);
    expect(s.lapsed).toBe(true);
    expect(s.lastRun).toBe(12);
  });
  it("cannot prove a streak without a date", () => {
    expect(effectiveStreak(7, null, "2026-10-05")).toBe(0);
  });
  it("zero stays zero and is not lapsed", () => {
    expect(streakStatus(0, null)).toMatchObject({ count: 0, lapsed: false });
  });
  it("tolerates a future date from clock skew", () => {
    expect(effectiveStreak(3, "2026-10-06", "2026-10-05")).toBe(3);
  });
  it("crosses month boundaries", () => {
    expect(effectiveStreak(4, "2026-09-30", "2026-10-01")).toBe(4);
  });
});

describe("streakFromDays", () => {
  it("counts back from today", () => {
    expect(streakFromDays(["2026-10-05", "2026-10-04", "2026-10-03"], "2026-10-05")).toBe(3);
  });
  it("does not break when today is not done yet", () => {
    expect(streakFromDays(["2026-10-04", "2026-10-03"], "2026-10-05")).toBe(2);
  });
  it("stops at a gap", () => {
    expect(streakFromDays(["2026-10-05", "2026-10-03"], "2026-10-05")).toBe(1);
  });
  it("is zero when the latest activity is older than yesterday", () => {
    expect(streakFromDays(["2026-10-02"], "2026-10-05")).toBe(0);
  });
});

describe("daysSinceActive", () => {
  it("derives from the check-in date", () => {
    expect(daysSinceActive("2026-10-02", 0, "2026-10-05")).toBe(3);
    expect(daysSinceActive("2026-10-05", 9, "2026-10-05")).toBe(0);
  });
  it("falls back to the stored counter without a date", () => {
    expect(daysSinceActive(null, 4, "2026-10-05")).toBe(4);
    expect(daysSinceActive(null, null, "2026-10-05")).toBeNull();
  });
});
