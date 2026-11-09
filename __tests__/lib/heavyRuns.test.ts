import { describe, it, expect } from "vitest";
import { decideHeavy, maxConcurrent, HEAVY_DAILY_LIMITS } from "@/lib/heavyRuns";

const base = { tier: "builder" as const, usedToday: 0, runningNow: 0, totalToday: 100, ceiling: 10000, maxConcurrent: 4 };

describe("decideHeavy", () => {
  it("lets a Builder run normally", () => expect(decideHeavy(base)).toEqual({ allowed: true, light: false }));
  it("stops at the daily cap and says when it resets", () => {
    const d = decideHeavy({ ...base, usedToday: HEAVY_DAILY_LIMITS.builder });
    expect(d.allowed).toBe(false);
    expect(!d.allowed && d.reason).toMatch(/midnight UTC/);
  });
  it("gives trials one and free none", () => {
    expect(decideHeavy({ ...base, tier: "trial" }).allowed).toBe(true);
    expect(decideHeavy({ ...base, tier: "trial", usedToday: 1 }).allowed).toBe(false);
    expect(decideHeavy({ ...base, tier: "free" }).allowed).toBe(false);
  });
  it("caps how many run at once across everyone, and says other pages are fine", () => {
    const d = decideHeavy({ ...base, runningNow: 4 });
    expect(!d.allowed && d.reason).toMatch(/unaffected/);
  });
  it("goes light at 70% load and pauses at 90%, even for Builders", () => {
    expect(decideHeavy({ ...base, totalToday: 7000 })).toEqual({ allowed: true, light: true });
    expect(decideHeavy({ ...base, totalToday: 9000 }).allowed).toBe(false);
  });
  it("ignores load when the guard is off or the load is unknown", () => {
    expect(decideHeavy({ ...base, totalToday: 99999, ceiling: 0 })).toEqual({ allowed: true, light: false });
    expect(decideHeavy({ ...base, totalToday: null })).toEqual({ allowed: true, light: false });
  });
  it("has a kill switch", () => expect(decideHeavy({ ...base, paused: true }).allowed).toBe(false));
  it("reads the concurrency env, with a safe default", () => {
    expect(maxConcurrent({})).toBe(4);
    expect(maxConcurrent({ HEAVY_MAX_CONCURRENT: "8" })).toBe(8);
    expect(maxConcurrent({ HEAVY_MAX_CONCURRENT: "0" })).toBe(4);
  });
});
