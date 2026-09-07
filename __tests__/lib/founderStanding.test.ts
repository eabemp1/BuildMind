/**
 * __tests__/lib/founderStanding.test.ts
 *
 * Unit tests for lib/server/founderStanding.ts — pure functions, no mocks,
 * same style as __tests__/lib/stageEvidence.test.ts.
 *
 * Covers the two things that mattered about this file:
 *   1. deriveEngagement's thresholds match what Projects-list's
 *      deriveProjectHealth() used before being migrated to read this
 *      instead — the whole point was to not change the answer, only
 *      where it's computed.
 *   2. deriveCofounderMode's priority order — this is the part that
 *      replaced CofounderPulse's old pickModeFromMemory(), and the order
 *      itself is the thing most likely to silently regress if someone
 *      reorders a branch later without realizing the order is load-bearing
 *      (e.g. engagement=stalled must outrank an otherwise-earned celebrate).
 */
import { describe, it, expect } from "vitest";
import { deriveEngagement, deriveCofounderMode, type FounderStanding } from "@/lib/server/founderStanding";
import type { StageReadiness, ReadinessTier } from "@/lib/server/stageReadiness";
import type { FounderMemory, DecisionPattern } from "@/lib/founderMemory";

// ── Fixtures ─────────────────────────────────────────────────────────────

function makeReadiness(tier: ReadinessTier): StageReadiness {
  return {
    tier,
    currentStage: "MVP",
    nextStage: "Launch",
    stageProgress: {
      stage: "MVP",
      totalMilestones: 5,
      completedMilestones: tier === "not_ready" ? 2 : 5,
      percent: tier === "not_ready" ? 40 : 100,
      isComplete: tier !== "not_ready",
      remainingTitles: [],
      totalTasks: 10,
      completedTasks: tier === "not_ready" ? 4 : 10,
    },
    evidence: {
      filledSlots: tier === "ready" ? 4 : tier === "checklist_only" ? 1 : 0,
      totalSlots: 4,
      meetsBar: tier === "ready",
      missingLabels: tier === "ready" ? [] : ["a metric", "an artifact"],
    },
    reflection: { count: 5, avgConfidence: 3.5, overrides: 0, meetsBar: true },
    headline: `test headline for ${tier}`,
    detail: `test detail for ${tier}`,
  };
}

function makeStanding(
  tier: ReadinessTier,
  engagement: "healthy" | "at-risk" | "stalled",
  daysInactive = 0,
): FounderStanding {
  return { readiness: makeReadiness(tier), engagement, daysInactive };
}

const EMPTY_MEMORY: Pick<FounderMemory, "avoidance_zones" | "decision_patterns" | "last_insight" | "strengths"> = {
  avoidance_zones: [],
  decision_patterns: [],
  last_insight: null,
  strengths: [],
};

function overduePattern(count: number): DecisionPattern {
  return { pattern: "overdue pricing decision", count, lastSeen: new Date().toISOString() };
}

// ── deriveEngagement ─────────────────────────────────────────────────────

describe("deriveEngagement — same thresholds Projects-list used before migration", () => {
  it("is healthy under 3 days inactive", () => {
    expect(deriveEngagement(0)).toBe("healthy");
    expect(deriveEngagement(2)).toBe("healthy");
  });
  it("is at-risk from 3 up to (not including) 7 days", () => {
    expect(deriveEngagement(3)).toBe("at-risk");
    expect(deriveEngagement(6)).toBe("at-risk");
  });
  it("is stalled at 7+ days", () => {
    expect(deriveEngagement(7)).toBe("stalled");
    expect(deriveEngagement(30)).toBe("stalled");
  });
});

// ── deriveCofounderMode — priority order ────────────────────────────────

describe("deriveCofounderMode — live urgency outranks everything else", () => {
  it("stalled engagement means alert, even with perfect readiness", () => {
    const standing = makeStanding("ready", "stalled");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY)).toBe("alert");
  });

  it("momentumScore < 35 means alert regardless of standing", () => {
    const standing = makeStanding("ready", "healthy");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY, 20)).toBe("alert");
  });

  it("momentumScore >= 35 does not force alert on its own", () => {
    const standing = makeStanding("checklist_only", "healthy");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY, 60)).not.toBe("alert");
  });

  it("5+ overdue decision patterns means alert even with healthy engagement", () => {
    const standing = makeStanding("ready", "healthy");
    const memory = { ...EMPTY_MEMORY, decision_patterns: [overduePattern(5)] };
    expect(deriveCofounderMode(standing, memory)).toBe("alert");
  });

  it("4 overdue decision patterns does not cross the alert bar", () => {
    const standing = makeStanding("checklist_only", "at-risk");
    const memory = { ...EMPTY_MEMORY, decision_patterns: [overduePattern(4)] };
    expect(deriveCofounderMode(standing, memory)).not.toBe("alert");
  });
});

describe("deriveCofounderMode — behavioral signals outrank a plain healthy verdict", () => {
  it("3+ avoidance zones means challenge even when engagement is healthy", () => {
    const standing = makeStanding("checklist_only", "healthy");
    const memory = { ...EMPTY_MEMORY, avoidance_zones: ["pricing", "hiring", "fundraising"] };
    expect(deriveCofounderMode(standing, memory)).toBe("challenge");
  });

  it("at-risk engagement alone means challenge", () => {
    const standing = makeStanding("checklist_only", "at-risk");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY)).toBe("challenge");
  });
});

describe("deriveCofounderMode — celebrate requires an earned combination, not just one good signal", () => {
  it("ready + healthy engagement means celebrate", () => {
    const standing = makeStanding("ready", "healthy");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY)).toBe("celebrate");
  });

  it("ready alone, with at-risk engagement, is NOT celebrate (engagement gates it)", () => {
    const standing = makeStanding("ready", "at-risk");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY)).not.toBe("celebrate");
  });

  it("3+ strengths + healthy engagement means celebrate even without ready readiness", () => {
    const standing = makeStanding("checklist_only", "healthy");
    const memory = { ...EMPTY_MEMORY, strengths: ["shipping cadence", "user empathy", "clear writing"] };
    expect(deriveCofounderMode(standing, memory)).toBe("celebrate");
  });
});

describe("deriveCofounderMode — insight and observing as the calm-state fallbacks", () => {
  it("a fresh last_insight with no other signal means insight", () => {
    const standing = makeStanding("checklist_only", "healthy");
    const memory = { ...EMPTY_MEMORY, last_insight: "You ship faster after a clear deadline." };
    expect(deriveCofounderMode(standing, memory)).toBe("insight");
  });

  it("no signals at all means observing, not a silently-wrong default", () => {
    const standing = makeStanding("not_ready", "healthy");
    expect(deriveCofounderMode(standing, EMPTY_MEMORY)).toBe("observing");
  });

  it("stalled engagement outranks a fresh insight — urgency wins", () => {
    const standing = makeStanding("checklist_only", "stalled");
    const memory = { ...EMPTY_MEMORY, last_insight: "Some insight." };
    expect(deriveCofounderMode(standing, memory)).toBe("alert");
  });
});
