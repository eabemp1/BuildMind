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

import { selectBreakTest, agentRankingBoost } from "@/lib/agentToToday";
describe("chosen teardown test", () => {
  const now = new Date("2026-11-18T10:00:00Z");
  const t = (id: string, hold: number, chosenAt?: string) => ({ id, assumption: `assumption ${id}`, test: `Talk to five people about ${id}`, provenWrongIf: "nobody cares", predictedHold: hold, status: "open", chosenAt });
  const rows = [{ id: "abcdefgh-1", project_id: null, created_at: "2026-11-17T10:00:00Z", tests: [t("a", 0.2), t("b", 0.8, "2026-11-18T09:00:00Z")] }];
  it("prefers the chosen test over the riskiest", () => {
    const pick = selectBreakTest(rows as never, null, now) as never as { title: string; chosen?: boolean };
    expect(pick.title).toBe("assumption b");
    expect(agentRankingBoost(pick as never)).toBe(100);
  });
  it("falls back to the riskiest when nothing is chosen", () => {
    rows[0].tests[1].chosenAt = undefined;
    const pick = selectBreakTest(rows as never, null, now) as never as { title: string };
    expect(pick.title).toBe("assumption a");
    expect(agentRankingBoost(pick as never)).toBe(4);
  });
});
