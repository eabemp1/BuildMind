import { describe, it, expect } from "vitest";
import { isTrialOnly, trialLine } from "@/lib/billingView";

describe("billing card", () => {
  it("a cardless trial is trial-only", () => {
    expect(isTrialOnly({ plan: "builder", trialActive: true, trialEndsAt: "2026-11-26T00:00:00Z", billingStatus: null })).toBe(true);
  });
  it("a paying subscriber is not, even if a trial flag lingers", () => {
    expect(isTrialOnly({ plan: "builder", trialActive: true, trialEndsAt: null, billingStatus: "active" })).toBe(false);
  });
  it("a free plan is not a trial", () => {
    expect(isTrialOnly({ plan: "free", trialActive: false, trialEndsAt: null, billingStatus: null })).toBe(false);
  });
  it("says the end date, no card, and no charge", () => {
    const t = trialLine("2026-11-26T00:00:00Z");
    expect(t).toContain("26 November 2026");
    expect(t).toContain("No card on file");
    expect(t).not.toMatch(/renew/i);
  });
});
