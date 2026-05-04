/**
 * __tests__/lib/scoring.test.ts
 *
 * Unit tests for lib/scoring/index.ts
 * Pure functions — no mocking, no DB, no network.
 */

import { describe, it, expect } from "vitest";
import {
  computeStartupScore,
  computeScoreDelta,
  applyScoreDelta,
  type Outcome,
} from "../../lib/scoring";

// ─── computeStartupScore ───────────────────────────────────────────────────

describe("computeStartupScore", () => {
  it("returns 0 when all inputs are empty/null", () => {
    expect(computeStartupScore({})).toBe(0);
  });

  it("uses execution_score as the primary signal (weight 0.45)", () => {
    // execution=80 * 0.45 = 36
    expect(computeStartupScore({ execution_score: 80 })).toBe(36);
  });

  it("adds momentum_score as a secondary signal (weight 0.25)", () => {
    // momentum=80 * 0.25 = 20
    expect(computeStartupScore({ momentum_score: 80 })).toBe(20);
  });

  it("combines execution and momentum correctly", () => {
    // exec=60*0.45=27, momentum=80*0.25=20 → 47
    expect(computeStartupScore({ execution_score: 60, momentum_score: 80 })).toBe(47);
  });

  it("adds 4 pts per validation strength (up to 20)", () => {
    // 3 strengths → +12
    expect(computeStartupScore({ validation_strengths: ["a", "b", "c"] })).toBe(12);
  });

  it("caps validation bonus at 20 (5+ strengths)", () => {
    const sixStrengths = ["a", "b", "c", "d", "e", "f"];
    expect(computeStartupScore({ validation_strengths: sixStrengths })).toBe(20);
  });

  it("XP below threshold gives 0 boost", () => {
    expect(computeStartupScore({ xp: 100 })).toBe(0);
  });

  it("XP ≥ 200 gives +4 boost", () => {
    expect(computeStartupScore({ xp: 200 })).toBe(4);
  });

  it("XP ≥ 3500 gives +20 boost (max)", () => {
    expect(computeStartupScore({ xp: 5000 })).toBe(20);
  });

  it("30-day streak gives +10 boost (max streak bonus)", () => {
    expect(computeStartupScore({ streak: 30 })).toBe(10);
  });

  it("streak capped at 30 days — 60-day streak = same as 30", () => {
    expect(computeStartupScore({ streak: 60 })).toBe(10);
  });

  it("streak scales proportionally below 30 days", () => {
    // 15 days = 50% of max → 5 pts
    expect(computeStartupScore({ streak: 15 })).toBe(5);
  });

  it("progress field is no longer a scoring input (noisy milestone signal removed)", () => {
    // progress should have no effect — score should remain 0
    expect(computeStartupScore({ progress: 100 } as any)).toBe(0);
  });

  it("caps result at 100 with all signals combined", () => {
    expect(
      computeStartupScore({
        execution_score: 95,
        momentum_score: 95,
        validation_strengths: ["a", "b", "c", "d", "e", "f"],
        xp: 5000,
        streak: 30,
      }),
    ).toBe(100);
  });

  it("handles null fields gracefully", () => {
    expect(
      computeStartupScore({
        execution_score: null,
        validation_strengths: null,
        momentum_score: null,
        xp: null,
        streak: null,
      }),
    ).toBe(0);
  });
});

// ─── computeScoreDelta ────────────────────────────────────────────────────

describe("computeScoreDelta", () => {
  const cases: [Outcome, number, number][] = [
    ["completed", 5, 6],   // high confidence completed → +6
    ["completed", 4, 6],   // confidence 4 = high threshold → +6
    ["completed", 3, 3],   // lower confidence completed → +3
    ["completed", 1, 3],   // even low confidence completed → +3
    ["partial",   3, 1],   // partial with ok confidence → +1
    ["partial",   2, -2],  // partial with low confidence → -2
    ["partial",   1, -2],  // partial with very low confidence → -2
    ["blocked",   5, -5],  // blocked always → -5
    ["blocked",   1, -5],  // blocked always → -5
    ["learned",   5, 2],   // learned → +2
    ["learned",   1, 2],   // learned → +2 regardless of confidence
  ];

  it.each(cases)(
    "outcome=%s confidence=%i → delta=%i",
    (outcome, confidence, expected) => {
      expect(computeScoreDelta(outcome, confidence)).toBe(expected);
    },
  );
});

// ─── applyScoreDelta ──────────────────────────────────────────────────────

describe("applyScoreDelta", () => {
  it("adds a positive delta normally", () => {
    expect(applyScoreDelta(64, 6)).toBe(70);
  });

  it("subtracts a negative delta normally", () => {
    expect(applyScoreDelta(64, -5)).toBe(59);
  });

  it("clamps to 100 on overflow", () => {
    expect(applyScoreDelta(98, 6)).toBe(100);
  });

  it("clamps to 0 on underflow", () => {
    expect(applyScoreDelta(3, -5)).toBe(0);
  });

  it("handles zero delta", () => {
    expect(applyScoreDelta(50, 0)).toBe(50);
  });
});

// ─── integration: computeScoreAfter behaviour matches today/page.tsx ─────

describe("score after reflect (integration)", () => {
  function computeScoreAfter(o: Outcome, confidence: number, before: number): number {
    return applyScoreDelta(before, computeScoreDelta(o, confidence));
  }

  it("completed + high confidence from 64 → 70", () => {
    expect(computeScoreAfter("completed", 4, 64)).toBe(70);
  });

  it("blocked from 64 → 59", () => {
    expect(computeScoreAfter("blocked", 3, 64)).toBe(59);
  });

  it("learned from 64 → 66", () => {
    expect(computeScoreAfter("learned", 5, 64)).toBe(66);
  });

  it("score never exceeds 100 even after multiple completes", () => {
    let score = 95;
    for (let i = 0; i < 5; i++) {
      score = computeScoreAfter("completed", 5, score);
    }
    expect(score).toBe(100);
  });

  it("score never goes below 0 even after multiple blocks", () => {
    let score = 8;
    for (let i = 0; i < 5; i++) {
      score = computeScoreAfter("blocked", 1, score);
    }
    expect(score).toBe(0);
  });
});
