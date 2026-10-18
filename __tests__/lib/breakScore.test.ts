import { describe, it, expect } from "vitest";
import { computeSurvival, normalizeSignals, previewScore, DIMENSIONS } from "@/lib/breakScore";

const all = (n: number) => Object.fromEntries(DIMENSIONS.map((d) => [d, n]));

describe("break score", () => {
  it("spans the range instead of clustering", () => {
    const low = computeSurvival(normalizeSignals(all(0))!, "an app");
    const mid = computeSurvival(normalizeSignals(all(3))!, "");
    const high = computeSurvival(normalizeSignals(all(5))!, "");
    expect(low).toBeLessThan(15);
    expect(mid).toBeGreaterThan(45);
    expect(mid).toBeLessThan(65);
    expect(high).toBeGreaterThan(80);
    expect(high).toBeLessThanOrEqual(92);
  });

  it("rejects incomplete model ratings", () => {
    expect(normalizeSignals({ problem_severity: 3 })).toBeNull();
    expect(normalizeSignals(null)).toBeNull();
    expect(normalizeSignals({ ...all(9) })!.problem_severity).toBe(5);
  });

  it("the no-AI preview gives different ideas different scores", () => {
    const ideas = [
      "An app for everyone to connect",
      "A WhatsApp bot for Ghanaian market sellers who lose 3 hours a day tracking stock by hand; they pay GHS 30 a month. I talked to 12 sellers and 4 joined the waitlist.",
      "AI-powered platform solution for the future",
      "A calculator for freelance designers in Lagos that prices projects, sold to agencies for $20 per month",
      "A blockchain social network marketplace",
    ];
    const scores = ideas.map((i) => previewScore(i));
    expect(new Set(scores).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...scores) - Math.min(...scores)).toBeGreaterThan(25);
    expect(scores[1]).toBeGreaterThan(scores[2]);
    expect(scores.every((s) => s !== 28 || new Set(scores).size > 1)).toBe(true);
  });
});

import { weakestTest } from "@/lib/breakScore";
describe("weakestTest", () => {
  it("picks the lowest-rated dimension", () => {
    const w = weakestTest({ problem_severity: 4, target_clarity: 4, demand_evidence: 1, differentiation: 3, reachability: 3, monetization: 2, feasibility: 5 });
    expect(w.dimension).toBe("demand_evidence");
    expect(w.test.length).toBeGreaterThan(20);
  });
});
