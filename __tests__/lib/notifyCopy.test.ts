import { describe, it, expect } from "vitest";
import { radarFoundMessage, marketWatchMessage, weeklyRecapMessage, milestoneDueMessage, pmfMessage } from "@/lib/notifyCopy";

const NOW = Date.parse("2026-11-06T09:00:00Z");
const inDays = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

describe("radarFoundMessage", () => {
  it("leads with the soonest closing date", () => {
    const m = radarFoundMessage([{ title: "Grant B", deadline_at: inDays(20) }, { title: "Grant A", deadline_at: inDays(6) }, { title: "Meetup" }], NOW);
    expect(m).toBe("Radar: Grant A closes in 6 days. 2 more openings fit you.");
  });
  it("falls back to the first when nothing has a date", () => {
    expect(radarFoundMessage([{ title: "Meetup" }], NOW)).toBe("Radar: Meetup.");
  });
  it("ignores dates that have passed", () => {
    expect(radarFoundMessage([{ title: "Old", deadline_at: inDays(-3) }], NOW)).toBe("Radar: Old.");
  });
  it("says tomorrow and today", () => {
    expect(radarFoundMessage([{ title: "X", deadline_at: inDays(1) }], NOW)).toBe("Radar: X closes tomorrow.");
  });
});

describe("marketWatchMessage", () => {
  it("names the change and counts the rest", () => {
    expect(marketWatchMessage([{ text: "Acme moved its price to $29" }, { text: "b" }])).toBe("Market Watch: Acme moved its price to $29 (+1 more this week)");
  });
  it("is empty without changes", () => { expect(marketWatchMessage([])).toBe(""); });
});

describe("weeklyRecapMessage", () => {
  it("lists only what is non-zero", () => {
    expect(weeklyRecapMessage({ done: 4, replies: 1, waiting: 0 })).toBe("This week: 4 actions done, 1 reply.");
  });
  it("says nothing when there is nothing", () => { expect(weeklyRecapMessage({ done: 0, replies: 0, waiting: 0 })).toBeNull(); });
});

describe("milestone and fit messages", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");
  it("leads with the soonest milestone and counts the rest", () => {
    const m = milestoneDueMessage([{ title: "Launch beta", target_date: "2026-11-12" }, { title: "First 5 interviews", target_date: "2026-11-10" }], now)!;
    expect(m).toContain("First 5 interviews");
    expect(m).toContain("is due in 2 days");
    expect(m).toContain("1 more milestone is close");
  });
  it("names an overdue milestone as overdue", () => {
    expect(milestoneDueMessage([{ title: "Pricing", target_date: "2026-11-05" }], now)).toContain("was due 3 days ago");
  });
  it("says nothing without milestones, or with no measured fit signs", () => {
    expect(milestoneDueMessage([], now)).toBeNull();
    expect(pmfMessage({ observed: 0, total: 6, notMeasured: 6 }, null)).toBeNull();
  });
  it("states the fit count and the next thing to check", () => {
    expect(pmfMessage({ observed: 2, total: 6, notMeasured: 2 }, "People found you unprompted")).toBe("Fit evidence: 2 of 6 signs observed. Next to check: people found you unprompted.");
  });
});
