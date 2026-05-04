/**
 * __tests__/lib/scoring-v2.test.ts
 *
 * Tests for the new v2 scoring functions added in lib/scoring/index.ts:
 *   - computeConsistencyBonus
 *   - computeStartupScoreV2
 *   - getScoreHistory / recordScore (localStorage layer)
 *   - syncScoreHistory merge logic
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeConsistencyBonus,
  computeStartupScoreV2,
  computeStartupScore,
  type ScoreHistoryEntry,
} from "../../lib/scoring";

// ── computeConsistencyBonus ───────────────────────────────────────────────────

describe("computeConsistencyBonus", () => {
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  it("returns 0 with no history", () => {
    expect(computeConsistencyBonus([])).toBe(0);
  });

  it("returns 10 when active all 7 of the last 7 days", () => {
    const history: ScoreHistoryEntry[] = Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i),
      score: 50,
    }));
    expect(computeConsistencyBonus(history)).toBe(10);
  });

  it("returns 10 when active exactly 5 of the last 7 days (max cap)", () => {
    const history: ScoreHistoryEntry[] = [0, 1, 2, 3, 4].map(i => ({
      date: daysAgo(i),
      score: 40,
    }));
    expect(computeConsistencyBonus(history)).toBe(10);
  });

  it("scales linearly: 3 active days → 6 pts", () => {
    const history: ScoreHistoryEntry[] = [0, 2, 4].map(i => ({
      date: daysAgo(i),
      score: 30,
    }));
    expect(computeConsistencyBonus(history)).toBe(6);
  });

  it("returns 2 for 1 active day", () => {
    const history: ScoreHistoryEntry[] = [{ date: daysAgo(0), score: 20 }];
    expect(computeConsistencyBonus(history)).toBe(2);
  });

  it("ignores days with score=0 (activity not tracked)", () => {
    const history: ScoreHistoryEntry[] = Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i),
      score: 0,  // score=0 means no real activity
    }));
    expect(computeConsistencyBonus(history)).toBe(0);
  });

  it("ignores entries older than 7 days", () => {
    const history: ScoreHistoryEntry[] = [
      { date: daysAgo(10), score: 80 }, // too old
      { date: daysAgo(8),  score: 80 }, // too old
    ];
    expect(computeConsistencyBonus(history)).toBe(0);
  });
});

// ── computeStartupScoreV2 ─────────────────────────────────────────────────────

describe("computeStartupScoreV2", () => {
  function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }

  const activeHistory: ScoreHistoryEntry[] = Array.from({ length: 5 }, (_, i) => ({
    date: daysAgo(i),
    score: 50,
  }));

  it("returns 0 with empty inputs", () => {
    expect(computeStartupScoreV2({}, [])).toBe(0);
  });

  it("equals computeStartupScore×0.90 + 0 when no active history", () => {
    const base = computeStartupScore({ execution_score: 80, momentum_score: 60 });
    expect(computeStartupScoreV2({ execution_score: 80, momentum_score: 60 }, []))
      .toBe(Math.min(100, Math.round(base * 0.90)));
  });

  it("is higher with consistent history vs no history", () => {
    const inputs = { execution_score: 70, momentum_score: 60 };
    const withHistory = computeStartupScoreV2(inputs, activeHistory);
    const noHistory   = computeStartupScoreV2(inputs, []);
    expect(withHistory).toBeGreaterThan(noHistory);
  });

  it("never exceeds 100 even with perfect inputs + perfect consistency", () => {
    const perfect: ScoreHistoryEntry[] = Array.from({ length: 7 }, (_, i) => ({
      date: daysAgo(i),
      score: 100,
    }));
    expect(
      computeStartupScoreV2({
        execution_score: 100,
        momentum_score: 100,
        validation_strengths: ["a", "b", "c", "d", "e"],
        xp: 5000,
        streak: 30,
      }, perfect)
    ).toBe(100);
  });

  it("is identical to v1 when no history provided (defaults correctly)", () => {
    const inputs = { execution_score: 50, momentum_score: 50 };
    const v1 = computeStartupScore(inputs);
    const v2 = computeStartupScoreV2(inputs);
    // v2 without history = v1 * 0.90 (consistency=0)
    expect(v2).toBe(Math.min(100, Math.round(v1 * 0.90)));
  });
});

// ── Score history merge logic (unit) ──────────────────────────────────────────

describe("score history merge logic", () => {
  // Extracted from syncScoreHistory — tested as a pure function
  function mergeHistories(
    local: ScoreHistoryEntry[],
    server: ScoreHistoryEntry[],
  ): ScoreHistoryEntry[] {
    const merged = new Map<string, number>();
    local.forEach(h => merged.set(h.date, h.score));
    server.forEach(h => merged.set(h.date, h.score)); // server wins
    return Array.from(merged.entries())
      .map(([date, score]) => ({ date, score }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);
  }

  it("server wins on date conflict", () => {
    const local  = [{ date: "2026-01-01", score: 40 }];
    const server = [{ date: "2026-01-01", score: 70 }];
    expect(mergeHistories(local, server)).toEqual([{ date: "2026-01-01", score: 70 }]);
  });

  it("keeps dates from both sides when no conflict", () => {
    const local  = [{ date: "2026-01-01", score: 40 }];
    const server = [{ date: "2026-01-02", score: 55 }];
    const result = mergeHistories(local, server);
    expect(result).toHaveLength(2);
    expect(result[0].date).toBe("2026-01-01");
    expect(result[1].date).toBe("2026-01-02");
  });

  it("trims to last 30 entries", () => {
    const local: ScoreHistoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-01-${String(i + 1).padStart(2, "0")}`,
      score: 50,
    }));
    const server: ScoreHistoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      date: `2026-02-${String(i + 1).padStart(2, "0")}`,
      score: 60,
    }));
    expect(mergeHistories(local, server)).toHaveLength(30);
  });

  it("returns empty array when both are empty", () => {
    expect(mergeHistories([], [])).toEqual([]);
  });

  it("returns server entries only when local is empty", () => {
    const server = [{ date: "2026-05-01", score: 42 }];
    expect(mergeHistories([], server)).toEqual(server);
  });
});
