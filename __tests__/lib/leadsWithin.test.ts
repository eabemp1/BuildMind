import { describe, it, expect } from "vitest";
import { within } from "@/lib/leads/engine";
describe("within", () => {
  it("returns the answer when it is in time", async () => { expect(await within(Promise.resolve(1), 100, null)).toBe(1); });
  it("gives the fallback when the request is too slow or no time is left", async () => {
    expect(await within(new Promise((r) => setTimeout(() => r(1), 200)), 10, null)).toBeNull();
    expect(await within(new Promise((r) => setTimeout(() => r(1), 50)), -5, "late")).toBe("late");
  });
});
import { thinReason } from "@/lib/leads/engine";
describe("thinReason", () => {
  it("says the check is incomplete when only some searches answered", () => {
    expect(thinReason(1, { resultsFound: 5, pagesRead: 3, places: 0, searches: 3, searchFailed: 1 })).toContain("1 of 3 searches did not answer in time");
    expect(thinReason(1, { resultsFound: 5, pagesRead: 3, places: 0, searches: 3, searchFailed: 0 })).not.toContain("incomplete");
  });
});
