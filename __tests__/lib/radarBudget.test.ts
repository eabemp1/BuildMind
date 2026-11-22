import { describe, it, expect } from "vitest";
import { radarBudget, yearConfirmed, isRoundup } from "@/lib/radar/budget";

describe("radar budget", () => {
  it("automatic runs are small, the founder's button keeps the wider search", () => {
    expect(radarBudget("auto", {})).toEqual({ queries: 2, reads: 3 });
    expect(radarBudget("manual", {})).toEqual({ queries: 4, reads: 6 });
  });
  it("is tunable and bounded", () => {
    expect(radarBudget("auto", { RADAR_AUTO_QUERIES: "3", RADAR_AUTO_READS: "9" })).toEqual({ queries: 3, reads: 6 });
    expect(radarBudget("auto", { RADAR_AUTO_QUERIES: "x" }).queries).toBe(2);
  });
});
describe("a date needs its year on the page", () => {
  it("accepts a page that states the year", () => {
    expect(yearConfirmed("2026-12-14", "Applications close 14 December 2026.")).toBe(true);
  });
  it("rejects a bare day and month, and a different year", () => {
    expect(yearConfirmed("2026-12-14", "Applications close 14 December.")).toBe(false);
    expect(yearConfirmed("2026-12-14", "Winners of the 2025 round were announced")).toBe(false);
  });
  it("does not match the year inside a longer number", () => {
    expect(yearConfirmed("2026-12-14", "Prize pool 120260 USD")).toBe(false);
    expect(yearConfirmed(null, "2026")).toBe(false);
  });
});
describe("roundups are not primary sources", () => {
  it("flags lists and listings, keeps organiser pages", () => {
    expect(isRoundup("Top 10 startup grants in Africa", "https://blog.example/x")).toBe(true);
    expect(isRoundup("Upcoming hackathons this year", "https://a.example/h")).toBe(true);
    expect(isRoundup("Grant", "https://site.example/blog/grants-2026")).toBe(true);
    expect(isRoundup("Tony Elumelu Entrepreneurship Programme 2026", "https://tefconnect.com/programme")).toBe(false);
  });
});
