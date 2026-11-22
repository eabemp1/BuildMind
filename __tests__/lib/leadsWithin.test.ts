import { describe, it, expect } from "vitest";
import { within } from "@/lib/leads/engine";
describe("within", () => {
  it("returns the answer when it is in time", async () => { expect(await within(Promise.resolve(1), 100, null)).toBe(1); });
  it("gives the fallback when the request is too slow or no time is left", async () => {
    expect(await within(new Promise((r) => setTimeout(() => r(1), 200)), 10, null)).toBeNull();
    expect(await within(new Promise((r) => setTimeout(() => r(1), 50)), -5, "late")).toBe("late");
  });
});
