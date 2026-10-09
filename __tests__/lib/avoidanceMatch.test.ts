import { describe, it, expect } from "vitest";
import { matchZones } from "@/lib/avoidanceMatch";
import { gradeAvoidanceResistance, gradeDeadlineRecovery } from "@/lib/patternGrading";
import { validateTargetDate } from "@/app/api/milestones/target-date/route";

describe("matchZones", () => {
  it("matches a category zone by action type", () => {
    expect(matchZones(["Finding users"], [{ title: "Send 5 messages", actionType: "outreach" }])).toEqual(["Finding users"]);
  });
  it("matches by keyword in the action text", () => {
    expect(matchZones(["Technical blocker"], [{ title: "Fix the signup bug", actionType: null }])).toEqual(["Technical blocker"]);
  });
  it("does not match unrelated work", () => {
    expect(matchZones(["Finding users"], [{ title: "Tidy the logo", actionType: "other" }])).toEqual([]);
  });
  it("leaves zones without a mapping to manual resolve", () => {
    expect(matchZones(["Motivation"], [{ title: "Anything", actionType: "build" }])).toEqual([]);
  });
});

describe("avoidance and deadline grades", () => {
  it("grades faced areas as a share of all areas", () => {
    const g = gradeAvoidanceResistance({ unGhostedCount: 1, currentAvoidanceZoneCount: 1 });
    expect(g.score).toBe(50);
    expect(g.grade).toBe("C");
  });
  it("stays F with a clear next step when nothing was faced", () => {
    const g = gradeAvoidanceResistance({ unGhostedCount: 0, currentAvoidanceZoneCount: 2 });
    expect(g.grade).toBe("F");
    expect(g.basis).toMatch(/mark it faced/);
  });
  it("tells the founder how to unlock Deadline Recovery", () => {
    expect(gradeDeadlineRecovery({ milestoneRisks: ["unknown"] }).basis).toMatch(/Set a deadline/);
  });
});

describe("validateTargetDate", () => {
  const now = new Date("2026-10-09T10:00:00Z");
  it("accepts today and later", () => {
    expect(validateTargetDate("2026-10-09", now)).toEqual({ ok: true, date: "2026-10-09" });
    expect(validateTargetDate("2026-12-01", now).ok).toBe(true);
  });
  it("accepts null to clear", () => {
    expect(validateTargetDate(null, now)).toEqual({ ok: true, date: null });
  });
  it("rejects past, malformed, impossible and far dates", () => {
    expect(validateTargetDate("2026-10-08", now).ok).toBe(false);
    expect(validateTargetDate("10/12/2026", now).ok).toBe(false);
    expect(validateTargetDate("2026-02-31", now).ok).toBe(false);
    expect(validateTargetDate("2030-01-01", now).ok).toBe(false);
  });
});
