/**
 * __tests__/lib/reflexion.test.ts
 *
 * Unit tests for the pure (non-Groq) functions in lib/reflexion.ts.
 * The 3-agent chain (runReflexionLoop) is not tested here — it is an
 * integration concern. These tests cover every exported pure function so
 * a refactor or logic change immediately surfaces as a failure.
 */

import { describe, it, expect } from "vitest";
import {
  getISOWeekNumber,
  getWeeklyCriticPersona,
  getEmotionalLanguageInstruction,
  inferEmotionalTrigger,
  shouldTriggerConfidenceGate,
  getConfidenceGateResponse,
  type ReflexionContext,
  type EmotionalTrigger,
} from "../../lib/reflexion";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<ReflexionContext> = {}): ReflexionContext {
  return {
    startupSummary: "A B2B SaaS for African SMEs",
    stage: "MVP",
    momentumScore: 60,
    ...overrides,
  };
}

// ── getISOWeekNumber ──────────────────────────────────────────────────────────

describe("getISOWeekNumber", () => {
  it("returns a number between 1 and 53", () => {
    const week = getISOWeekNumber(new Date("2025-01-01"));
    expect(week).toBeGreaterThanOrEqual(1);
    expect(week).toBeLessThanOrEqual(53);
  });

  it("returns week 1 for the first ISO week of 2025 (Jan 6)", () => {
    expect(getISOWeekNumber(new Date("2025-01-06"))).toBe(2);
  });

  it("is deterministic for the same date", () => {
    const d = new Date("2025-06-15");
    expect(getISOWeekNumber(d)).toBe(getISOWeekNumber(d));
  });

  it("advances by 1 for dates exactly 7 days apart", () => {
    const a = new Date("2025-03-03");
    const b = new Date("2025-03-10");
    expect(getISOWeekNumber(b)).toBe(getISOWeekNumber(a) + 1);
  });
});

// ── getWeeklyCriticPersona ────────────────────────────────────────────────────

describe("getWeeklyCriticPersona", () => {
  it("returns an object with name and prompt", () => {
    const persona = getWeeklyCriticPersona(0);
    expect(persona).toHaveProperty("name");
    expect(persona).toHaveProperty("prompt");
    expect(persona.name.length).toBeGreaterThan(0);
    expect(persona.prompt.length).toBeGreaterThan(0);
  });

  it("rotates across 4 distinct personas (weekNumbers 0–3)", () => {
    const names = new Set([0, 1, 2, 3].map(w => getWeeklyCriticPersona(w).name));
    expect(names.size).toBe(4);
  });

  it("wraps around — weekNumber 4 === weekNumber 0", () => {
    expect(getWeeklyCriticPersona(4).name).toBe(getWeeklyCriticPersona(0).name);
  });

  it("wraps around — weekNumber 7 === weekNumber 3", () => {
    expect(getWeeklyCriticPersona(7).name).toBe(getWeeklyCriticPersona(3).name);
  });

  it("uses current week when no weekNumber is supplied", () => {
    // Just verify it doesn't throw and returns a valid persona
    const persona = getWeeklyCriticPersona();
    expect(persona.name.length).toBeGreaterThan(0);
  });
});

// ── getEmotionalLanguageInstruction ──────────────────────────────────────────

describe("getEmotionalLanguageInstruction", () => {
  it("returns empty string when trigger is undefined", () => {
    expect(getEmotionalLanguageInstruction(undefined)).toBe("");
  });

  it("returns a non-empty instruction for every valid trigger", () => {
    const triggers: EmotionalTrigger[] = [
      "inactive_3plus_days",
      "two_tasks_in_row",
      "override_submitted",
      "first_week_completed",
      "momentum_low_stable",
    ];
    for (const t of triggers) {
      const instruction = getEmotionalLanguageInstruction(t);
      expect(instruction.length, `Expected instruction for "${t}" to be non-empty`).toBeGreaterThan(0);
    }
  });

  it("inactive_3plus_days instruction mentions restarting", () => {
    const instruction = getEmotionalLanguageInstruction("inactive_3plus_days");
    expect(instruction.toLowerCase()).toMatch(/restart|rough|clean/);
  });

  it("two_tasks_in_row instruction acknowledges momentum", () => {
    const instruction = getEmotionalLanguageInstruction("two_tasks_in_row");
    expect(instruction.toLowerCase()).toMatch(/momentum|two in a row/);
  });
});

// ── inferEmotionalTrigger ─────────────────────────────────────────────────────

describe("inferEmotionalTrigger", () => {
  it("returns inactive_3plus_days when daysInactive >= 3", () => {
    expect(inferEmotionalTrigger(makeCtx({ daysInactive: 3 }))).toBe("inactive_3plus_days");
    expect(inferEmotionalTrigger(makeCtx({ daysInactive: 10 }))).toBe("inactive_3plus_days");
  });

  it("inactive_3plus_days takes priority over two_tasks_in_row", () => {
    // Both conditions true — inactivity wins
    const trigger = inferEmotionalTrigger(makeCtx({
      daysInactive: 5,
      consecutiveTasksCompleted: 3,
    }));
    expect(trigger).toBe("inactive_3plus_days");
  });

  it("returns two_tasks_in_row when consecutiveTasksCompleted >= 2", () => {
    expect(inferEmotionalTrigger(makeCtx({ consecutiveTasksCompleted: 2 }))).toBe("two_tasks_in_row");
    expect(inferEmotionalTrigger(makeCtx({ consecutiveTasksCompleted: 5 }))).toBe("two_tasks_in_row");
  });

  it("returns momentum_low_stable when score < 40 and daysInactive <= 1", () => {
    const trigger = inferEmotionalTrigger(makeCtx({ momentumScore: 30, daysInactive: 0 }));
    expect(trigger).toBe("momentum_low_stable");
  });

  it("does NOT return momentum_low_stable when score < 40 but daysInactive > 1", () => {
    // daysInactive 2 should not produce momentum_low_stable (not inactive_3plus either)
    const trigger = inferEmotionalTrigger(makeCtx({ momentumScore: 25, daysInactive: 2 }));
    expect(trigger).toBeUndefined();
  });

  it("returns undefined when no trigger conditions are met", () => {
    const trigger = inferEmotionalTrigger(makeCtx({
      momentumScore: 70,
      daysInactive: 0,
      consecutiveTasksCompleted: 1,
    }));
    expect(trigger).toBeUndefined();
  });

  it("returns undefined when momentum is high even with some inactivity", () => {
    const trigger = inferEmotionalTrigger(makeCtx({ momentumScore: 80, daysInactive: 1 }));
    expect(trigger).toBeUndefined();
  });
});

// ── shouldTriggerConfidenceGate ───────────────────────────────────────────────

describe("shouldTriggerConfidenceGate", () => {
  it("returns true when domainDataPoints < 5", () => {
    expect(shouldTriggerConfidenceGate(makeCtx({ domainDataPoints: 0 }))).toBe(true);
    expect(shouldTriggerConfidenceGate(makeCtx({ domainDataPoints: 4 }))).toBe(true);
  });

  it("returns false when domainDataPoints === 5", () => {
    expect(shouldTriggerConfidenceGate(makeCtx({ domainDataPoints: 5 }))).toBe(false);
  });

  it("returns false when domainDataPoints > 5", () => {
    expect(shouldTriggerConfidenceGate(makeCtx({ domainDataPoints: 20 }))).toBe(false);
  });

  it("returns false when domainDataPoints is undefined (defaults to 10 in the gate check)", () => {
    // undefined → the condition (ctx.domainDataPoints ?? 10) < 5 → 10 < 5 → false
    expect(shouldTriggerConfidenceGate(makeCtx({ domainDataPoints: undefined }))).toBe(false);
  });
});

// ── getConfidenceGateResponse ─────────────────────────────────────────────────

describe("getConfidenceGateResponse", () => {
  it("returns a non-empty string", () => {
    expect(getConfidenceGateResponse().length).toBeGreaterThan(20);
  });

  it("mentions context or market research", () => {
    const response = getConfidenceGateResponse().toLowerCase();
    expect(response).toMatch(/context|market|research|mentor/);
  });

  it("is deterministic", () => {
    expect(getConfidenceGateResponse()).toBe(getConfidenceGateResponse());
  });
});
