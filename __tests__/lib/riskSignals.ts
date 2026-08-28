/**
 * __tests__/lib/riskSignals.test.ts
 *
 * Unit tests for lib/riskSignals.ts — pure functions, no mocks needed.
 */

import { describe, it, expect } from "vitest";
import { computeChurnRisk, shouldTriggerRiskInterrupt, describeChurnRisk, buildRecoveryMission, type RiskSignal } from "@/lib/riskSignals";

const NOW = new Date("2026-08-27T12:00:00Z").getTime();
const daysAgo = (n: number) => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString();

function signal(overrides: Partial<RiskSignal>): RiskSignal {
  return {
    id: "sig-1",
    signal_type: "other",
    severity: "warning",
    value: null,
    note: "test signal",
    customer_name: null,
    mrr_at_risk: null,
    created_at: daysAgo(1),
    ...overrides,
  };
}

describe("computeChurnRisk", () => {
  it("returns zero risk with no signals", () => {
    const result = computeChurnRisk([], NOW);
    expect(result.churnProbability).toBe(0);
    expect(result.burnAtRisk).toBe(0);
    expect(result.recentSignals).toHaveLength(0);
  });

  it("ignores signals older than the 14-day lookback", () => {
    const result = computeChurnRisk([signal({ severity: "critical", created_at: daysAgo(20) })], NOW);
    expect(result.recentSignals).toHaveLength(0);
    expect(result.churnProbability).toBe(0);
  });

  it("weighs critical signals higher than warning", () => {
    const critical = computeChurnRisk([signal({ severity: "critical" })], NOW);
    const warning = computeChurnRisk([signal({ severity: "warning" })], NOW);
    expect(critical.churnProbability).toBeGreaterThan(warning.churnProbability);
  });

  it("increases risk for low NPS scores", () => {
    const lowNps = computeChurnRisk([signal({ signal_type: "nps_score", severity: "neutral", value: 2 })], NOW);
    const highNps = computeChurnRisk([signal({ signal_type: "nps_score", severity: "neutral", value: 9 })], NOW);
    expect(lowNps.churnProbability).toBeGreaterThan(highNps.churnProbability);
  });

  it("dedupes burn-at-risk per account by max, not sum", () => {
    const result = computeChurnRisk(
      [
        signal({ customer_name: "Acme Co", mrr_at_risk: 2000, created_at: daysAgo(3) }),
        signal({ customer_name: "Acme Co", mrr_at_risk: 4200, created_at: daysAgo(1) }),
      ],
      NOW,
    );
    expect(result.burnAtRisk).toBe(4200);
  });

  it("sums burn-at-risk across distinct accounts", () => {
    const result = computeChurnRisk(
      [
        signal({ customer_name: "Acme Co", mrr_at_risk: 4200 }),
        signal({ customer_name: "Globex", mrr_at_risk: 1500 }),
      ],
      NOW,
    );
    expect(result.burnAtRisk).toBe(5700);
  });

  it("caps churn probability at 100", () => {
    const many = Array.from({ length: 10 }, () => signal({ severity: "critical" }));
    const result = computeChurnRisk(many, NOW);
    expect(result.churnProbability).toBeLessThanOrEqual(100);
  });

  it("never goes below 0 even with all positive signals", () => {
    const result = computeChurnRisk([signal({ severity: "positive" }), signal({ severity: "positive" })], NOW);
    expect(result.churnProbability).toBe(0);
  });
});

describe("shouldTriggerRiskInterrupt", () => {
  it("triggers when churn probability crosses 70", () => {
    const assessment = computeChurnRisk(
      [signal({ severity: "critical" }), signal({ severity: "critical" }), signal({ severity: "critical" })],
      NOW,
    );
    expect(shouldTriggerRiskInterrupt(assessment)).toBe(true);
  });

  it("triggers on 2+ critical signals even below the probability threshold", () => {
    const assessment = { churnProbability: 40, burnAtRisk: 0, recentSignals: [], criticalCount: 2, topAccount: null };
    expect(shouldTriggerRiskInterrupt(assessment)).toBe(true);
  });

  it("triggers on 1 critical signal with meaningful MRR at risk", () => {
    const assessment = { churnProbability: 30, burnAtRisk: 1500, recentSignals: [], criticalCount: 1, topAccount: "Acme" };
    expect(shouldTriggerRiskInterrupt(assessment)).toBe(true);
  });

  it("does not trigger on a single low-severity signal", () => {
    const assessment = computeChurnRisk([signal({ severity: "neutral" })], NOW);
    expect(shouldTriggerRiskInterrupt(assessment)).toBe(false);
  });
});

describe("describeChurnRisk", () => {
  it("names the account with the most severe signal", () => {
    const assessment = computeChurnRisk(
      [signal({ severity: "critical", customer_name: "Acme Co" })],
      NOW,
    );
    expect(describeChurnRisk(assessment)).toContain("Acme Co");
  });

  it("handles the no-signals case", () => {
    const assessment = computeChurnRisk([], NOW);
    expect(describeChurnRisk(assessment)).toMatch(/No risk signals/);
  });
});

describe("buildRecoveryMission", () => {
  it("names the account and states the real burn-at-risk figure", () => {
    const assessment = computeChurnRisk(
      [
        signal({ severity: "critical", customer_name: "Acme Co", mrr_at_risk: 4200, signal_type: "support_ticket", note: "API lag" }),
        signal({ severity: "critical", customer_name: "Acme Co", signal_type: "nps_score", value: 3 }),
      ],
      NOW,
    );
    const mission = buildRecoveryMission(assessment);
    expect(mission.title).toContain("Acme Co");
    expect(mission.contextParagraph).toContain("$4,200");
    expect(mission.requiredSteps.length).toBeGreaterThanOrEqual(3);
    expect(mission.evidence.length).toBe(2);
  });

  it("still produces a sensible mission with no named account", () => {
    const assessment = computeChurnRisk([signal({ severity: "critical" })], NOW);
    const mission = buildRecoveryMission(assessment);
    expect(mission.title).toContain("An account");
    expect(mission.requiredSteps.length).toBeGreaterThan(0);
  });
});
