import { describe, it, expect } from "vitest";
import { ghostTarget, computeGhostRace, buildGhostHistory, weekdayWhereYouSlip, STARTER_GHOST, type WeekRecord } from "@/lib/ghostRace";
import { bucketWeeks, mondayOf } from "@/lib/ghostRaceData";

const wk = (weekStart: string, perDay: number[]): WeekRecord => ({ weekStart, perDay, total: perDay.reduce((a, b) => a + b, 0) });
const empty = (weekStart: string) => wk(weekStart, [0, 0, 0, 0, 0, 0, 0]);

describe("ghostTarget", () => {
  it("starts small for a new founder", () => {
    expect(ghostTarget([])).toMatchObject({ ghost: STARTER_GHOST, basis: "starter" });
    expect(ghostTarget([wk("2026-09-14", [1, 1, 0, 0, 0, 0, 0])]).basis).toBe("starter");
  });
  it("uses the median of recent active weeks", () => {
    const weeks = [wk("a", [1, 1, 1, 0, 0, 0, 0]), wk("b", [1, 1, 1, 1, 0, 0, 0]), wk("c", [1, 1, 0, 0, 0, 0, 0]), wk("d", [1, 1, 1, 0, 0, 0, 0])];
    expect(ghostTarget(weeks)).toMatchObject({ ghost: 3, basis: "history", stretched: false });
  });
  it("ignores empty weeks so a break does not set an unreachable bar", () => {
    const weeks = [wk("a", [1, 1, 1, 1, 0, 0, 0]), empty("b"), wk("c", [1, 1, 1, 1, 0, 0, 0])];
    // Two active weeks of 4: base 4, held twice, so stretched to 5. The empty week is ignored, not averaged in as 0.
    expect(ghostTarget(weeks)).toMatchObject({ ghost: 5, stretched: true, used: 2 });
  });
  it("stretches by one only after two weeks at or above the base, capped at 7", () => {
    const hold = [wk("a", [1, 1, 1, 0, 0, 0, 0]), wk("b", [1, 1, 1, 0, 0, 0, 0]), wk("c", [1, 1, 1, 0, 0, 0, 0])];
    expect(ghostTarget(hold)).toMatchObject({ ghost: 4, stretched: true });
    const full = [wk("a", [1, 1, 1, 1, 1, 1, 1]), wk("b", [1, 1, 1, 1, 1, 1, 1])];
    expect(ghostTarget(full).ghost).toBe(7);
  });
});

describe("computeGhostRace", () => {
  const prior = [wk("2026-09-14", [1, 1, 1, 0, 0, 0, 0]), wk("2026-09-21", [1, 1, 0, 1, 0, 0, 0]), wk("2026-09-28", [1, 0, 1, 1, 0, 0, 0])];
  it("is ahead, level, behind and won as the week goes", () => {
    const ghost = ghostTarget(prior).ghost; // 3 median, stretched to 4
    expect(ghost).toBe(4);
    const ahead = computeGhostRace({ completedWeeks: prior, current: wk("w", [1, 1, 1, 0, 0, 0, 0]), todayIndex: 2 });
    expect(ahead.status).toBe("ahead");
    const behind = computeGhostRace({ completedWeeks: prior, current: wk("w", [1, 0, 0, 0, 0, 0, 0]), todayIndex: 3 });
    expect(behind.status).toBe("behind");
    expect(behind.remaining).toBe(3);
    const won = computeGhostRace({ completedWeeks: prior, current: wk("w", [1, 1, 1, 1, 0, 0, 0]), todayIndex: 3 });
    expect(won.status).toBe("won");
  });
  it("counts a second action on the same day", () => {
    const r = computeGhostRace({ completedWeeks: prior, current: wk("w", [2, 0, 0, 0, 0, 0, 0]), todayIndex: 0 });
    expect(r.doneSoFar).toBe(2);
  });
  it("says so honestly when the week can no longer be won", () => {
    const r = computeGhostRace({ completedWeeks: prior, current: wk("w", [1, 0, 0, 0, 0, 0, 0]), todayIndex: 5 });
    expect(r.canStillWin).toBe(false);
    expect(r.status).toBe("out_of_reach");
  });
  it("does not count today as a remaining day once today is done", () => {
    const r = computeGhostRace({ completedWeeks: prior, current: wk("w", [0, 0, 0, 0, 0, 1, 0]), todayIndex: 5 });
    expect(r.daysLeft).toBe(1);
  });
  it("tracks the beat streak across completed weeks", () => {
    const hist = buildGhostHistory(prior);
    expect(hist).toHaveLength(3);
    const r = computeGhostRace({ completedWeeks: prior, current: empty("w"), todayIndex: 0 });
    expect(r.status).toBe("starting");
    expect(r.history).toHaveLength(3);
  });
});

describe("weekdayWhereYouSlip", () => {
  it("needs history and a real gap", () => {
    expect(weekdayWhereYouSlip([wk("a", [1, 1, 1, 0, 0, 0, 0])])).toBeNull();
    const weeks = [1, 2, 3, 4].map((i) => wk(`w${i}`, [1, 1, 0, 1, 1, 0, 0]));
    expect(weekdayWhereYouSlip(weeks)).toBe(2); // first of the tied-lowest days
  });
});

describe("bucketWeeks", () => {
  it("uses the larger of the two sources per day, never the sum", () => {
    const monday = "2026-10-05";
    const { current } = bucketWeeks(["2026-10-05", "2026-10-05"], ["2026-10-05", "2026-10-06"], monday);
    expect(current.perDay.slice(0, 3)).toEqual([2, 1, 0]);
    expect(current.total).toBe(3);
  });
  it("finds Monday for any date", () => {
    expect(mondayOf("2026-10-08")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-10-05")).toBe("2026-10-05");
  });
  it("starts history at the first active week", () => {
    const { completed } = bucketWeeks(["2026-09-22"], [], "2026-10-05");
    expect(completed[0].weekStart).toBe("2026-09-21");
  });
});
