/**
 * __tests__/lib/sidebar-nav.test.ts
 *
 * Unit tests for the extracted sidebar-nav module (Fix 4).
 * Tests: NAV config completeness, hasPlanAccess, plan-gated items.
 * No DOM or React rendering required — pure data tests.
 */

import { describe, it, expect } from "vitest";
import { NAV, hasPlanAccess } from "../../lib/nav-config";
import type { Plan } from "../../lib/plan";

// ── NAV config completeness ───────────────────────────────────────────────────

describe("NAV config", () => {
  it("has at least 10 navigation items", () => {
    expect(NAV.length).toBeGreaterThanOrEqual(10);
  });

  it("every item has a non-empty href starting with /", () => {
    NAV.forEach(item => {
      expect(item.href).toMatch(/^\//);
    });
  });

  it("every item has a non-empty label", () => {
    NAV.forEach(item => {
      expect(item.label.trim().length).toBeGreaterThan(0);
    });
  });

  it("every item has an icon", () => {
    NAV.forEach(item => {
      expect(item.icon).toBeDefined();
      expect(typeof item.icon).toBe("function");
    });
  });

  it("showDot is a boolean on every item", () => {
    NAV.forEach(item => {
      expect(typeof item.showDot).toBe("boolean");
    });
  });

  it("enabled is a boolean on every item", () => {
    NAV.forEach(item => {
      expect(typeof item.enabled).toBe("boolean");
    });
  });

  it("plan-gated items have a requiredPlan of 'builder'", () => {
    const gated = NAV.filter(item => item.requiredPlan);
    expect(gated.length).toBeGreaterThanOrEqual(1);
    gated.forEach(item => {
      expect(item.requiredPlan).toBe("builder");
    });
  });

  it("/today exists and has no required plan (free access)", () => {
    const today = NAV.find(i => i.href === "/today");
    expect(today).toBeDefined();
    expect(today?.requiredPlan).toBeUndefined();
  });

  it("/reports is gated (builder-only)", () => {
    const reports = NAV.find(i => i.href === "/reports");
    expect(reports?.requiredPlan).toBe("builder");
  });

  it("/startup-kit is gated (builder-only)", () => {
    const kit = NAV.find(i => i.href === "/startup-kit");
    expect(kit?.requiredPlan).toBe("builder");
  });

  it("no duplicate hrefs", () => {
    const hrefs = NAV.map(i => i.href);
    const unique = new Set(hrefs);
    expect(unique.size).toBe(hrefs.length);
  });

  it("/reflect has showDot=true (pending action indicator)", () => {
    const reflect = NAV.find(i => i.href === "/reflect");
    expect(reflect?.showDot).toBe(true);
  });
});

// ── hasPlanAccess ─────────────────────────────────────────────────────────────

describe("hasPlanAccess", () => {
  const cases: [Plan, Plan, boolean][] = [
    ["free",    "free",    true],
    ["builder", "free",    true],
    ["builder", "builder", true],
    ["free",    "builder", false],
  ];

  it.each(cases)(
    "hasPlanAccess(%s, %s) → %s",
    (current, required, expected) => {
      expect(hasPlanAccess(current, required)).toBe(expected);
    }
  );

  it("free plan cannot access builder-gated items", () => {
    expect(hasPlanAccess("free", "builder")).toBe(false);
  });

  it("builder plan can access free items", () => {
    expect(hasPlanAccess("builder", "free")).toBe(true);
  });
});
