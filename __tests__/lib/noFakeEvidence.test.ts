import { describe, it, expect } from "vitest";
import { buildLedger } from "@/lib/today/facts";
import { reportsNothingReal } from "@/lib/realness";

const day = (n: number) => new Date(Date.UTC(2026, 10, n)).toISOString();

describe("simulated text is not evidence", () => {
  it("a simulated 'got first users' does not cancel the no-users fact", () => {
    const l = buildLedger([
      { created_at: day(1), outcome: "blocked", note: "I don't have any users yet." },
      { created_at: day(2), outcome: "completed", note: "Simulated test run: pretend I got 3 users." },
    ]);
    expect(l.facts.some((f) => f.kind === "no_users")).toBe(true);
  });
  it("a real 'got first users' still cancels it", () => {
    const l = buildLedger([
      { created_at: day(1), outcome: "blocked", note: "I don't have any users yet." },
      { created_at: day(2), outcome: "completed", note: "Got my first 3 users today." },
    ]);
    expect(l.facts.some((f) => f.kind === "no_users")).toBe(false);
  });
  it("detects simulated and no-contact wording", () => {
    expect(reportsNothingReal("fictional founder, simulated check-in")).toBe(true);
    expect(reportsNothingReal("Spoke to two shop owners about repairs")).toBe(false);
  });
});
