import { describe, it, expect } from "vitest";
import { agentForClaim, investigateBody, canInvestigate } from "@/lib/break/investigate";
import { claimStatus } from "@/lib/evidence";

const f = (positive: boolean, sources: string[]) => ({ positive, signal_type: "demand_confirmed", source_type: "web_search", evidence: "x", confidence: 0.7, sources, counter_evidence: "something that argues against" });

describe("investigate a claim", () => {
  it("routes by words", () => {
    expect(agentForClaim("Larger competitors already offer this")).toBe("competitor");
    expect(agentForClaim("Founders will pay $20 a month")).toBe("validation");
    expect(agentForClaim("The market is growing quickly")).toBe("research");
  });
  it("project wins over idea text; idea used when no project", () => {
    expect(investigateBody("Founders will pay monthly", { projectId: "p1", idea: "idea" })).toMatchObject({ projectId: "p1" });
    const b = investigateBody("Founders will pay monthly", { idea: "an idea about x" });
    expect(b).toMatchObject({ idea: "an idea about x" });
    expect((b as Record<string, unknown>).projectId).toBeUndefined();
  });
  it("needs a real claim and some context", () => {
    expect(canInvestigate("short", { projectId: "p" })).toBe(false);
    expect(canInvestigate("a long enough claim", {})).toBe(false);
    expect(canInvestigate("a long enough claim", { idea: "an idea about x" })).toBe(true);
  });
  it("claim status counts only well-sourced findings", () => {
    expect(claimStatus([])).toBe("unverified");
    expect(claimStatus([f(true, ["https://a.com/1"])])).toBe("unverified");
    expect(claimStatus([f(true, ["https://a.com/1", "https://b.com/2"])])).toBe("supported");
    expect(claimStatus([f(false, ["https://a.com/1", "https://b.com/2", "https://c.com/3"])])).toBe("contradicted");
    expect(claimStatus([f(true, ["https://a.com/1", "https://b.com/2"]), f(false, ["https://c.com/1", "https://d.com/2", "https://e.com/3"])])).toBe("mixed");
  });
});
