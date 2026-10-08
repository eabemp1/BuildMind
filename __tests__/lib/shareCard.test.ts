import { describe, it, expect } from "vitest";
import { headline, insightRows, usableStory, shareCaption } from "@/lib/shareCard";

const day = (date: string, weights: number[]) => ({
  date, day_label: "x", activities: weights.map((w, i) => ({ title: `t${i}`, type: "x", weight: w })), total_weight: weights.reduce((a, b) => a + b, 0),
});
const base: any = {
  tasks_completed: 4, tasks_total: 5, streak: 12, momentum_score: 74, momentum_delta: 6,
  day_activity: [day("2026-10-05", [90, 60]), day("2026-10-06", []), day("2026-10-07", [100, 40, 55])],
  un_ghosted: [], grades: [], story: "4 of 5 tasks completed this week (80%). Momentum: 74/100.",
};

describe("share card content", () => {
  it("headline reflects real counts", () => {
    expect(headline(base).big).toBe("4");
    expect(headline({ ...base, tasks_completed: 5 }).sub).toMatch(/Every day/);
    expect(headline({ ...base, tasks_completed: 0 }).sub).toMatch(/quiet/i);
    expect(headline({ ...base, tasks_total: 0, tasks_completed: 0 }).line).toBe("days logged");
  });
  it("hides the stats-only story but keeps a written one", () => {
    expect(usableStory(base.story)).toBeNull();
    expect(usableStory("You do your best work early in the week.")).toMatch(/best work/);
  });
  it("builds insight rows only from real data", () => {
    const rows = insightRows(base);
    expect(rows[0]).toEqual({ k: "Strongest day", v: "Wednesday, 3 finished actions" });
    expect(insightRows({ ...base, day_activity: [] })).toEqual([]);
    expect(insightRows({ ...base, un_ghosted: ["Pricing"] }).some((r) => r.k === "Faced")).toBe(true);
  });
  it("caption carries the numbers and the link", () => {
    const c = shareCaption(base);
    expect(c).toContain("4 of 5 days showed up");
    expect(c).toContain("12-day streak");
    expect(c).toContain("+6 vs last week");
    expect(c).toContain("buildmind.live");
  });
});
