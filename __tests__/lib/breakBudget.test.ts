import { describe, expect, it } from "vitest";
import { createBudget, reflexionDeadline } from "@/lib/break/budget";

const clock = () => { let t = 1_000_000; return { now: () => t, tick: (ms: number) => { t += ms; } }; };

describe("Break My Startup request budget", () => {
  it("ends at 55s by default and says how much is left", () => {
    const c = clock(); const b = createBudget(55_000, c.now);
    expect(b.remaining()).toBe(55_000);
    c.tick(30_000);
    expect(b.remaining()).toBe(25_000);
    c.tick(60_000);
    expect(b.remaining()).toBe(0);
  });
  it("lets optional stages run only when enough time is left, and records what was skipped", () => {
    const c = clock(); const b = createBudget(55_000, c.now);
    c.tick(40_000);
    expect(b.canRun(18_000)).toBe(false);
    b.skip("pivots"); b.skip("pivots"); b.skip("execution_plan");
    expect(b.summary().skipped).toEqual(["pivots", "execution_plan"]);
    expect(b.summary().partial).toBe(true);
  });
  it("records stage timings even when a stage throws", async () => {
    const c = clock(); const b = createBudget(55_000, c.now);
    await b.time("agents", async () => { c.tick(25_000); });
    await expect(b.time("pivots", async () => { c.tick(3_000); throw new Error("x"); })).rejects.toThrow("x");
    expect(b.summary().timings).toEqual({ agents: 25_000, pivots: 3_000 });
    expect(b.summary().partial).toBe(false);
  });
  it("gives reflexion its usual 26s early on, and never more than the request can afford late", () => {
    const c = clock(); const b = createBudget(55_000, c.now);
    expect(reflexionDeadline(b, c.now())).toBe(c.now() + 26_000);
    c.tick(40_000);
    expect(reflexionDeadline(b, c.now())).toBe(b.deadline - 6_000);
    expect(reflexionDeadline(b, c.now()) - c.now()).toBe(9_000);
  });
  it("gives each run its own id", () => {
    expect(createBudget().runId).not.toBe(createBudget().runId);
  });
});
