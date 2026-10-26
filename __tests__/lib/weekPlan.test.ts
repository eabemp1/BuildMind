import { describe, it, expect } from "vitest";
import { planWeek, workingDays, energyToday } from "@/lib/coachActions/weekPlan";
import { matchCoachAction } from "@/lib/coachActions/matcher";

const NOW = new Date("2026-10-26T09:00:00Z"); // Monday
const ms = [{ id: "m1", title: "Validation", status: "active", created_at: "2026-10-01T00:00:00Z", target_date: null }, { id: "m2", title: "Launch", status: "active", created_at: "2026-10-02T00:00:00Z", target_date: null }];
const task = (id: string, milestone_id: string, created_at = "2026-10-20T00:00:00Z", is_completed = false) => ({ id, milestone_id, title: `Task ${id}`, notes: null, is_completed, created_at });

describe("planWeek", () => {
  it("skips weekends", () => {
    expect(workingDays(new Date("2026-10-31T09:00:00Z"), 2).map((d) => d.toISOString().slice(0, 10))).toEqual(["2026-11-02", "2026-11-03"]);
  });
  it("orders by milestone then age and never plans done tasks", () => {
    const p = planWeek(ms as never, [task("c", "m2"), task("a", "m1"), task("done", "m1", undefined, true), task("b", "m1", "2026-10-21T00:00:00Z")] as never, null, NOW);
    expect(p.days.flatMap((d) => d.tasks.map((t) => t.id))).toEqual(["a", "b", "c"]);
    expect(p.openTotal).toBe(3);
  });
  it("gives a low-energy today a single task", () => {
    const tasks = ["1", "2", "3", "4", "5"].map((i) => task(i, "m1"));
    expect(planWeek(ms as never, tasks as never, "low", NOW).days[0].tasks).toHaveLength(1);
    expect(planWeek(ms as never, tasks as never, "fresh", NOW).days[0].tasks).toHaveLength(3);
    expect(planWeek(ms as never, tasks as never, null, NOW).days[0].tasks).toHaveLength(2);
  });
  it("puts stale tasks last and labels them", () => {
    const p = planWeek(ms as never, [task("old", "m1", "2026-08-01T00:00:00Z"), task("new", "m2")] as never, null, NOW);
    expect(p.days[0].tasks.map((t) => t.id)).toEqual(["new", "old"]);
    expect(p.staleCount).toBe(1);
  });
  it("uses an energy report only if it is from today", () => {
    expect(energyToday({ level: "low", at: "2026-10-26T07:00:00Z" }, NOW)).toBe("low");
    expect(energyToday({ level: "low", at: "2026-10-25T07:00:00Z" }, NOW)).toBeNull();
    expect(energyToday({ level: "nope", at: "2026-10-26T07:00:00Z" }, NOW)).toBeNull();
  });
});

describe("matcher", () => {
  it("recognises week-planning requests and nothing broader", () => {
    expect(matchCoachAction("re-plan my week")?.id).toBe("plan_week");
    expect(matchCoachAction("Can you plan my week please")?.id).toBe("plan_week");
    expect(matchCoachAction("what should I work on this week")?.id).toBe("plan_week");
    expect(matchCoachAction("how was my week")).not.toMatchObject({ id: "plan_week" });
  });
});
