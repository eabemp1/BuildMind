import { describe, it, expect } from "vitest";
import { classifyFinding, demandUnbacked } from "@/lib/evidence";
import { tierLabel } from "@/lib/agentWorkforce";
import { inventedTerms } from "@/lib/prep/experienceGuard";
import { dropPatternClaims, guardBriefing, TEST_RUN_RISK } from "@/lib/briefingTestGuard";

const f = (o: Record<string, unknown> = {}) => ({ signal_type: "demand_confirmed", positive: true, confidence: 0.8, evidence: "", sources: ["https://a.com/x", "https://b.com/y", "https://c.com/z"], source_type: "web_search", counter_evidence: "Some owners use paper diaries instead.", ...o }) as Parameters<typeof classifyFinding>[0];

describe("Scout: vendor marketing is not confirmed demand", () => {
  it("vendor marketing with no survey data stays a signal", () => {
    const c = classifyFinding(f({ evidence: "Vendors say bike shops lose 30% of bookings. There is no survey or search volume data." }));
    expect(c.tier).toBe("signal");
    expect(c.caveat).toMatch(/Not confirmed/);
  });
  it("a finding that cites marketing pages is unbacked", () => {
    expect(demandUnbacked({ evidence: "The vendor's own website claims strong demand", counter_evidence: null })).toBe(true);
  });
  it("a user saying they have the pain is not capped", () => {
    expect(demandUnbacked({ evidence: "A shop owner wrote: I hate missing bookings, it wastes time every week", counter_evidence: null })).toBe(false);
    expect(classifyFinding(f({ evidence: "A shop owner wrote: I hate missing bookings, it wastes time every week" })).tier).not.toBe("signal");
  });
});

describe("a failed verdict withholds the strong label", () => {
  it("shows a plain label when the verdict step did not complete", () => {
    expect(tierLabel("decision_grade", true)).toBe("Supported (verdict not completed)");
    expect(tierLabel("decision_grade", false)).toBe("Strong, not yet reviewed");
    expect(tierLabel("signal", true)).toBe("Signal");
  });
});

describe("data-handling promises are the founder's to make", () => {
  const promises = [
    "Your data is stored securely in the EU.",
    "We store your bookings on encrypted servers.",
    "Customer data is encrypted and never leaves your account.",
    "Your information will be deleted after 30 days.",
    "All records are securely stored on our servers.",
    "Our servers are located in Ireland.",
  ];
  for (const p of promises) it(`flags: ${p}`, () => expect(inventedTerms(p, "").length).toBeGreaterThan(0));
  it("allows it when the founder stated it", () => {
    expect(inventedTerms("Your data is stored securely in the EU.", "Your data is stored securely in the EU.")).toEqual([]);
  });
  it("leaves ordinary sentences alone", () => {
    expect(inventedTerms("Do you keep a list of customers who miss bookings?", "")).toEqual([]);
  });
});

describe("morning briefing on a test run", () => {
  it("drops avoidance claims and keeps the rest", () => {
    expect(dropPatternClaims("You are avoiding outreach. Pick one shop to call.", true)).toBe("Pick one shop to call.");
  });
  it("replaces a risk that is only an avoidance claim", () => {
    expect(guardBriefing({ win: "Shipped a draft", risk: "You keep putting off outreach." }, true).risk).toBe(TEST_RUN_RISK);
  });
  it("changes nothing for a real account", () => {
    const b = { win: "w", risk: "You are avoiding outreach." };
    expect(guardBriefing(b, false)).toEqual(b);
  });
});
