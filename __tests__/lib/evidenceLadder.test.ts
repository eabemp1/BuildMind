import { describe, it, expect } from "vitest";
import { evidenceRung, topRung, dedupeFindings, priceUnverified, classifyFinding } from "@/lib/evidence";

describe("evidence ladder", () => {
  it("places text on the right rung", () => {
    expect(evidenceRung("Shops use spreadsheets for scheduling")).toBe("adjacent_clue");
    expect(evidenceRung("I hate waiting, the problem is no queue")).toBe("direct_pain");
    expect(evidenceRung("One owner said they would pay for it")).toBe("stated_willingness");
    expect(evidenceRung("Two shops paid for a pilot")).toBe("paid_pilot");
    expect(evidenceRung("The shop renewed for a second month")).toBe("repeat_payment");
  });
  it("a hypothetical payment is not a payment", () => {
    expect(evidenceRung("they might pay if it worked")).not.toBe("paid_pilot");
  });
  it("topRung takes the highest", () => {
    expect(topRung(["a clue", "someone would pay"])).toBe("stated_willingness");
    expect(topRung([])).toBe("adjacent_clue");
  });
  it("dedupes near-identical titles, keeping the better sourced", () => {
    const out = dedupeFindings([
      { title: "Bike shops lose customers to long queues", confidence: 0.5, sources: [] },
      { title: "Bike shops lose customers because of long queues", confidence: 0.4, sources: ["https://a.com"] },
      { title: "Competitor charges monthly fee", confidence: 0.6, sources: [] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].sources).toEqual(["https://a.com"]);
  });
  it("flags a price with no source", () => {
    expect(priceUnverified({ evidence: "Competitor costs $39/month", sources: [] })).toBe(true);
    expect(priceUnverified({ evidence: "Competitor costs $39/month", sources: ["https://x.com"] })).toBe(false);
    expect(classifyFinding({ signal_type: "competitor", positive: false, confidence: 0.5, evidence: "Costs $20/month", source_type: "reasoning" }).caveat).toMatch(/Price not verified/);
  });
});

describe("willingness to pay needs someone willing to pay", () => {
  const base = { signal_type: "willingness_to_pay" as const, positive: true, confidence: 0.8, source_type: "web_search", sources: ["https://a.com", "https://b.com"], counter_evidence: "Looked for owners who refused to pay." };
  it("free alternatives do not count", () => {
    const r = classifyFinding({ ...base, title: "t", evidence: "Several free booking tools exist." } as never);
    expect(r.tier).toBe("signal");
    expect(r.caveat).toMatch(/free alternatives/);
  });
  it("a stated intent can still be decision grade", () => {
    expect(classifyFinding({ ...base, title: "t", evidence: "Two owners said they would pay $20 a month." } as never).tier).toBe("decision_grade");
  });
});
describe("same statistic twice", () => {
  it("is one finding", () => {
    const out = dedupeFindings([
      { title: "No-shows cost shops revenue", confidence: 0.5, evidence: "Industry reports 30% of appointments are missed." },
      { title: "Missed appointments hurt service businesses", confidence: 0.5, evidence: "About 30% missed appointments." },
    ] as never);
    expect(out).toHaveLength(1);
  });
});
