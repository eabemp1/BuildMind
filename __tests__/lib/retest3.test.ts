import { describe, it, expect } from "vitest";
import { scrubPrivacyPromises } from "@/lib/prep/experienceGuard";
import { verdictIncomplete, tierLabel, kindLabel, runReadiness } from "@/lib/evidence";
import { freeIfZeroBudget } from "@/lib/constraints";

describe("privacy promises", () => {
  it("replaces unsupported statements, keeps questions and the rest", () => {
    const out = scrubPrivacyPromises("Do you book online? Your data is kept private and never shared. Pick a time.", "");
    expect(out).toContain("Do you book online?");
    expect(out).toContain("[add: your privacy answer]");
    expect(out).not.toMatch(/never shared/);
    expect(out).toContain("Pick a time.");
  });
  it("allows what the founder wrote", () => {
    expect(scrubPrivacyPromises("We delete data on request.", "we delete data on request")).toContain("delete");
  });
});

describe("labels", () => {
  it("flags incomplete verdicts", () => {
    expect(verdictIncomplete({ status: "error" })).toBe(true);
    expect(verdictIncomplete({ top_risk: "Could not complete verdict" })).toBe(true);
    expect(verdictIncomplete({ status: "done", top_risk: "x" })).toBe(false);
  });
  it("tier and kind labels", () => {
    expect(tierLabel("decision_grade", true)).toBe("Supported (verdict not completed)");
    expect(kindLabel("demand_confirmed", "signal")).toMatch(/not confirmed/);
  });
  it("incomplete run caps readiness", () => {
    expect(typeof runReadiness([], { incomplete: true })).toBeDefined();
  });
});

describe("zero budget", () => {
  it("replaces paid steps", () => {
    const out = freeIfZeroBudget("Spend $100 on ads", { minutesPerDay: null, monthlyBudget: 0 });
    expect(out).not.toMatch(/\$100/);
  });
});
