import { describe, it, expect } from "vitest";
import { buildInvestorVisual, type InvestorInputs } from "@/lib/investor/visual";

const empty: InvestorInputs = { revenue: [], milestones: { total: 0, done: 0 }, tasks: { total: 0, done: 0 }, people: { reached: 0, talked: 0 } };
const text = (v: object) => JSON.stringify(v);

describe("investor snapshot", () => {
  it("empty record shows an explanation, not zeros", () => {
    const { visual, shown } = buildInvestorVisual(empty);
    expect(shown).toBe(0);
    expect(text(visual)).toContain("Nothing to show yet");
  });
  it("shows only what exists, with its source", () => {
    const { visual } = buildInvestorVisual({ ...empty, revenue: [{ source: "Stripe", payingCustomers: 4, recurringKnown: true, mrr: { USD: 120 }, last30d: { USD: 150 }, paymentsLast30d: 5 }], milestones: { total: 5, done: 2 } });
    const t = text(visual);
    expect(t).toContain("Paying customers");
    expect(t).toContain("USD 120");
    expect(t).toContain("Stripe");
    expect(t).toContain("2 of 5");
    expect(t).not.toContain("Google search");
  });
  it("hides MRR when the tool has no recurring notion", () => {
    expect(text(buildInvestorVisual({ ...empty, revenue: [{ source: "Paystack", payingCustomers: 2, recurringKnown: false, mrr: { GHS: 0 }, last30d: { GHS: 300 }, paymentsLast30d: 2 }] }).visual)).not.toContain("recurring revenue");
  });
  it("always says what is left out and never invents burn or retention", () => {
    const t = text(buildInvestorVisual({ ...empty, milestones: { total: 1, done: 1 } }).visual);
    expect(t).toContain("Left out on purpose");
    expect(t).not.toMatch(/runway of|burn multiple|NRR of/i);
  });
});
