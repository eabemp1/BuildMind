import { describe, it, expect } from "vitest";
import { sanitizeFinding, type AgentFinding } from "@/lib/agentWorkforce";
import { competitorBlock } from "@/lib/work/context";

const base: AgentFinding = { signal_type: "user_pain", positive: true, confidence: 0.5, title: "t", evidence: "Owners complain.", source_type: "web_search", action_hint: "x" };
const ctx = "Result: https://a.com — Many shop owners say the booking queue costs them customers every week.";

describe("source quote", () => {
  it("keeps a quote that is really in the search text and adds it to the evidence", () => {
    const r = sanitizeFinding({ ...base, quote: "shop owners say the booking queue costs them customers" }, ctx);
    expect(r.quote).toBeTruthy();
    expect(r.evidence).toContain("Source says:");
  });
  it("drops an invented quote", () => {
    const r = sanitizeFinding({ ...base, quote: "Ninety percent of shops will pay for this tomorrow" }, ctx);
    expect(r.quote).toBeNull();
    expect(r.evidence).not.toContain("Source says");
  });
});
describe("competitorBlock", () => {
  it("lists the founder's own picks", () => {
    expect(competitorBlock([{ name: "Acme", url: "https://acme.com" }])).toContain("Acme");
    expect(competitorBlock([])).toBe("");
  });
});
