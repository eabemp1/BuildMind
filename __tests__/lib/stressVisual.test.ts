import { describe, it, expect } from "vitest";
import { buildStressVisual } from "@/lib/visuals/stressVisual";
import { matchCoachAction } from "@/lib/coachActions/matcher";
import { catalog } from "@/lib/work/registry";

const NOW = new Date("2026-11-05T00:00:00Z");
const ms = (id: string, title: string, created: string, target: string | null, status = "active") => ({ id, title, status, created_at: created, target_date: target });
const task = (id: string, m: string, done: boolean, created: string) => ({ id, milestone_id: m, title: `Task ${id}`, notes: null, is_completed: done, created_at: created });

describe("milestone stress test", () => {
  it("says so when nothing has a date", () => {
    const { visual, summary } = buildStressVisual({ milestones: [ms("a", "Beta", "2026-10-01T00:00:00Z", null)], tasks: [], now: NOW });
    expect(summary.dated).toBe(0);
    expect(visual.panels[0].type).toBe("callout");
  });

  it("flags a milestone that is behind at its real pace and lists the oldest open tasks", () => {
    // created 40 days ago, 2 of 10 done, target 5 days away: far behind
    const tasks = [
      ...["1", "2"].map((i) => task(i, "a", true, "2026-09-26T00:00:00Z")),
      ...["3", "4", "5", "6", "7", "8", "9", "10"].map((i, k) => task(i, "a", false, `2026-10-${String(10 + k).padStart(2, "0")}T00:00:00Z`)),
    ];
    const { visual, summary } = buildStressVisual({ milestones: [ms("a", "Beta", "2026-09-26T00:00:00Z", "2026-11-10")], tasks, now: NOW });
    expect(summary.high).toBe(1);
    const types = visual.panels.map((p) => p.type);
    expect(types).toContain("bars");
    expect(types).toContain("tree");
    const tree = visual.panels.find((p) => p.type === "tree") as Extract<(typeof visual.panels)[number], { type: "tree" }>;
    expect(tree.branches[0].children).toHaveLength(3);
    expect(tree.branches[0].children?.[0].label).toBe("Task 3");
    expect(tree.caption).toMatch(/does not track dependencies/);
  });

  it("calls an on-pace milestone on pace, and never invents a projection with no tasks done", () => {
    const ok = buildStressVisual({ milestones: [ms("a", "Beta", "2026-10-25T00:00:00Z", "2026-12-30")], tasks: [task("1", "a", true, "2026-10-25T00:00:00Z"), task("2", "a", true, "2026-10-26T00:00:00Z"), task("3", "a", false, "2026-10-27T00:00:00Z")], now: NOW });
    expect(ok.summary.low).toBe(1);
    const none = buildStressVisual({ milestones: [ms("b", "Later", "2026-11-01T00:00:00Z", "2026-12-30")], tasks: [task("9", "b", false, "2026-11-01T00:00:00Z")], now: NOW });
    expect(none.summary.unknown).toBe(1);
    expect(none.visual.panels.some((p) => p.type === "bars")).toBe(false);
  });

  it("ignores completed milestones", () => {
    expect(buildStressVisual({ milestones: [ms("a", "Done", "2026-10-01T00:00:00Z", "2026-11-01", "completed")], tasks: [], now: NOW }).summary.dated).toBe(0);
  });

  it("the coach recognises the request, and Work lists it", () => {
    expect(matchCoachAction("stress test my milestones")?.id).toBe("draw_stress_test");
    expect(matchCoachAction("will I hit my deadlines?")?.id).toBe("draw_stress_test");
    expect(matchCoachAction("chart my progress this month")?.id).toBe("draw_progress");
    expect(catalog().some((e) => e.id === "visual:stress" && e.source === "visual")).toBe(true);
  });
});
