import { describe, it, expect } from "vitest";
import { scoreMatch, rank, pushRecent } from "@/lib/commandSearch";

const items = [
  { label: "Start a focus session", keywords: "timer pomodoro" },
  { label: "Find Customers", keywords: "leads prospects" },
  { label: "Break My Startup", keywords: "stress test risk" },
  { label: "Landing page", keywords: "publish signup" },
  { label: "Settings: Billing", keywords: "plan invoice card" },
];

describe("command search", () => {
  it("ranks prefix above word-start above contains", () => {
    expect(scoreMatch("find", items[1])).toBeGreaterThan(scoreMatch("custom", items[1]));
    expect(scoreMatch("cust", items[1])).toBeGreaterThan(scoreMatch("tomers", items[1]));
  });
  it("finds by keyword and across words", () => {
    expect(rank(items, "pomodoro")[0].label).toBe("Start a focus session");
    expect(rank(items, "stress test")[0].label).toBe("Break My Startup");
    expect(rank(items, "invoice")[0].label).toBe("Settings: Billing");
  });
  it("tolerates a skipped letter on longer queries but not on junk", () => {
    expect(rank(items, "fcus")[0]?.label).toBe("Start a focus session");
    expect(rank(items, "zzqx")).toEqual([]);
  });
  it("returns nothing for an empty query", () => { expect(scoreMatch("  ", items[0])).toBe(0); });
  it("keeps recents unique, newest first, capped", () => {
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["1", "2", "3", "4", "5", "6"], "7")).toEqual(["7", "1", "2", "3", "4", "5"]);
  });
});
