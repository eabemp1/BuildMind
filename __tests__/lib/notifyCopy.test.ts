import { describe, it, expect } from "vitest";
import { radarFoundMessage, marketWatchMessage, weeklyRecapMessage } from "@/lib/notifyCopy";

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
