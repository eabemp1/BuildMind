import { describe, it, expect } from "vitest";
import { weeklyRhythm, welcomeMoment } from "@/lib/today/rhythm";

// Thu 2026-11-05. Weeks start Monday: 11-02, 10-26, 10-19.
const now = new Date("2026-11-05T10:00:00Z");

describe("weeklyRhythm", () => {
  it("counts finished weeks with three active days and tolerates four days off", () => {
    const days = ["2026-10-19", "2026-10-21", "2026-10-25", "2026-10-26", "2026-10-28", "2026-10-30"];
    expect(weeklyRhythm(days, now).weeks).toBe(2);
  });
  it("the week in progress never breaks the chain, and counts once it has three days", () => {
    const prior = ["2026-10-26", "2026-10-27", "2026-10-28"];
    expect(weeklyRhythm(prior, now)).toMatchObject({ weeks: 1, thisWeek: 0 });
    expect(weeklyRhythm([...prior, "2026-11-02", "2026-11-03", "2026-11-04"], now).weeks).toBe(2);
  });
  it("a finished week under the bar ends the chain", () => {
    expect(weeklyRhythm(["2026-10-26", "2026-10-27", "2026-10-19", "2026-10-20", "2026-10-21"], now).weeks).toBe(0);
  });
  it("counts each day once and reports days since the last one", () => {
    expect(weeklyRhythm(["2026-11-01", "2026-11-01"], now)).toMatchObject({ daysSince: 4 });
    expect(weeklyRhythm([], now).daysSince).toBeNull();
  });
});

describe("welcomeMoment", () => {
  it("after three or more days away", () => {
    expect(welcomeMoment({ weeks: 0, thisWeek: 0, daysSince: 3 }, now)?.kind).toBe("back");
    expect(welcomeMoment({ weeks: 2, thisWeek: 1, daysSince: 2 }, now)).toBeNull();
  });
  it("on a Monday with nothing done yet", () => {
    const mon = new Date("2026-11-09T08:00:00Z");
    expect(welcomeMoment({ weeks: 1, thisWeek: 0, daysSince: 1 }, mon)?.kind).toBe("week");
    expect(welcomeMoment({ weeks: 1, thisWeek: 1, daysSince: 0 }, mon)).toBeNull();
  });
  it("nothing for someone who has never acted", () => expect(welcomeMoment({ weeks: 0, thisWeek: 0, daysSince: null }, now)).toBeNull());
  it("never says what was missed", () => {
    const t = welcomeMoment({ weeks: 0, thisWeek: 0, daysSince: 9 }, now)!.text.toLowerCase();
    expect(t).not.toMatch(/miss|streak|lost|behind/);
  });
});
