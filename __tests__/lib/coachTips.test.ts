import { describe, it, expect } from "vitest";
import { pickCoachTip, type CoachTipInput } from "@/lib/coachTips";

const base: CoachTipInput = {
  momentum: 50, momentumDelta: 0, streak: 2, activeDaysThisWeek: 1, daysElapsedThisWeek: 3,
  activeDaysLastWeekSamePoint: 1, completedToday: false, pendingActionTitle: null, daysInactive: 0,
  overdueMilestones: 0, worstOverdue: null, topAvoidance: null, calibrating: false,
};

describe("pickCoachTip", () => {
  it("sends nothing while calibrating", () => {
    expect(pickCoachTip({ ...base, calibrating: true, daysInactive: 9 })).toBeNull();
  });
  it("sends nothing when there is no real signal", () => {
    expect(pickCoachTip(base)).toBeNull();
  });
  it("suggests a tiny comeback step after inactivity", () => {
    expect(pickCoachTip({ ...base, daysInactive: 4 })?.id).toBe("comeback");
  });
  it("flags a milestone that is 3+ days late", () => {
    const t = pickCoachTip({ ...base, overdueMilestones: 2, worstOverdue: { title: "Launch page", daysLate: 5 } });
    expect(t?.id).toBe("overdue");
    expect(t?.body).toContain("Launch page");
  });
  it("ignores milestones only a day late", () => {
    expect(pickCoachTip({ ...base, worstOverdue: { title: "x", daysLate: 1 }, overdueMilestones: 1 })).toBeNull();
  });
  it("reacts to a momentum drop", () => {
    expect(pickCoachTip({ ...base, momentumDelta: -12 })?.id).toBe("momentum_drop");
  });
  it("names the avoidance pattern when the founder is active", () => {
    const t = pickCoachTip({ ...base, topAvoidance: "outreach", activeDaysThisWeek: 3 });
    expect(t?.id).toBe("avoidance");
    expect(t?.because).toContain("outreach");
  });
  it("protects a 7-day streak multiple only if not done today", () => {
    expect(pickCoachTip({ ...base, streak: 14 })?.id).toBe("streak_protect");
    expect(pickCoachTip({ ...base, streak: 14, completedToday: true })).toBeNull();
  });
  it("celebrates being ahead of last week", () => {
    expect(pickCoachTip({ ...base, activeDaysThisWeek: 4, activeDaysLastWeekSamePoint: 2 })?.id).toBe("ahead_of_last_week");
  });
});
