import { describe, expect, it } from "vitest";
import { deterministicInsights } from "@/lib/insightsFallback";

const map = {
  "avoidance:0": 'Avoidance zone on record: "Community participation"',
  execution_rate: "50% overall execution rate (5 of 10 shown tasks completed) in the last 30 days",
  "completion_day:Tue": "Tue: 3 of 3 tasks completed in the last 30 days",
  "completion_day:Fri": "Fri: 0 of 3 tasks completed in the last 30 days",
  "strength:0": 'Strength on record: "Shipping fast"',
};

describe("deterministicInsights", () => {
  it("builds grounded insights from real numbers, each citing a real key", () => {
    const out = deterministicInsights({
      avoidanceZones: ["Community participation"], strengths: ["Shipping fast"],
      totalTasksShown: 10, totalTasksCompleted: 5,
      completionByDay: { Tue: { completed: 3, total: 3 }, Fri: { completed: 0, total: 3 } },
    }, map);
    expect(out.length).toBeGreaterThanOrEqual(3);
    for (const i of out) { expect(i.basis).not.toBeNull(); expect(i.evidence).toBe((map as Record<string, string>)[i.basis!]); }
    expect(out[0].text).toContain("Community participation");
  });
  it("returns nothing when there is no data to cite", () => {
    expect(deterministicInsights({}, {})).toEqual([]);
  });
  it("never cites a key that is not in the evidence map", () => {
    const out = deterministicInsights({ avoidanceZones: ["x"] }, {});
    expect(out).toEqual([]);
  });
});
