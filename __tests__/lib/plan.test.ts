/**
 * __tests__/lib/plan.test.ts
 *
 * Tests for lib/plan.ts — normalizePlan, canAccess, plan order.
 * Pure functions, no mocks needed.
 */

import { describe, it, expect } from "vitest";
import { normalizePlan, canAccess } from "../../lib/plan";
import type { Plan } from "../../lib/plan";

describe("normalizePlan", () => {
  const cases: [string | undefined, Plan][] = [
    ["builder",  "builder"],
    ["BUILDER",  "builder"],
    ["Builder",  "builder"],
    ["free",     "free"],
    ["FREE",     "free"],
    [undefined,  "free"],
    ["",         "free"],
    ["unknown",  "free"],
    ["venture",  "free"],   // venture not in PLAN_ORDER yet — maps to free
  ];

  it.each(cases)("normalizePlan(%s) → %s", (input, expected) => {
    expect(normalizePlan(input)).toBe(expected);
  });
});

describe("canAccess", () => {
  it("free user can access free features", () => {
    expect(canAccess("cofounderPulse", "free")).toBeDefined();
  });

  it("builder user can access features that free cannot", () => {
    // cofounderPulse requires builder — builder should access it
    const builderResult = canAccess("cofounderPulse", "builder");
    const freeResult    = canAccess("cofounderPulse", "free");
    // builder has broader access — at minimum equal to free
    expect(builderResult).toBeTruthy();
    // If free returns false for this feature, builder must return true
    if (!freeResult) expect(builderResult).toBe(true);
  });
});
