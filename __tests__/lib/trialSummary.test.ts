import { describe, expect, it } from "vitest";
import { trialSummary } from "@/lib/trialSummary";
import { PLAN_DAILY_LIMITS, PLAN_MONTHLY_LIMITS, CORE_DAILY_LIMITS } from "@/lib/aiLimits";
import { PLAN_LIMITS } from "@/lib/plan";

describe("trialSummary", () => {
  const all = (() => { const s = trialSummary(); return [...s.included, ...s.limits, ...s.afterwards].join("\n"); })();
  it("quotes the limits the server enforces", () => {
    expect(all).toContain(`${PLAN_DAILY_LIMITS.trial} uses a day`);
    expect(all).toContain(`${PLAN_MONTHLY_LIMITS.trial} over the trial`);
    expect(all).toContain(`up to ${CORE_DAILY_LIMITS.trial} a day`);
  });
  it("says what the Free plan keeps", () => {
    expect(all).toContain(`${PLAN_LIMITS.free.actionsPerWeek} daily tasks a week`);
    expect(all).toMatch(/Your data stays/);
    expect(all).toMatch(/No card is on file/);
  });
});
