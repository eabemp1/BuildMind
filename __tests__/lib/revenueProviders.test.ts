import { describe, it, expect } from "vitest";
import { checkPaystackKey, summarisePaystack } from "@/lib/integrations/revenue/paystack";
import { checkPolarToken, summarisePolar, monthlyMinorPolar } from "@/lib/integrations/revenue/polar";
import { ManualRevenueSchema, summariseManual } from "@/lib/integrations/revenue/manual";
import { revenueFacts, isRevenueProvider } from "@/lib/integrations/revenue";
import { steeringBlock } from "@/lib/integrations/steer";

const NOW = new Date("2026-10-26T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();

describe("Paystack", () => {
  it("accepts secret keys only", () => {
    expect(checkPaystackKey("sk_live_" + "a".repeat(30)).ok).toBe(true);
    expect(checkPaystackKey("pk_live_" + "a".repeat(30)).ok).toBe(false);
    expect(checkPaystackKey("nope").ok).toBe(false);
  });
  it("sums successful payments in the last 30 days in major units, per currency", () => {
    const s = summarisePaystack([
      { status: "success", amount: 5000, currency: "GHS", paid_at: daysAgo(2), customer: { email: "A@x.com" } },
      { status: "success", amount: 2500, currency: "GHS", paid_at: daysAgo(5), customer: { email: "a@x.com" } },
      { status: "success", amount: 100000, currency: "NGN", paid_at: daysAgo(9), customer: { email: "b@x.com" } },
      { status: "failed", amount: 9999, currency: "GHS", paid_at: daysAgo(1), customer: { email: "c@x.com" } },
      { status: "success", amount: 7000, currency: "GHS", paid_at: daysAgo(45), customer: { email: "d@x.com" } },
      { status: "success", amount: 7000, currency: "GHS", paid_at: null, customer: { email: "e@x.com" } },
    ], "live", NOW);
    expect(s.last30d).toEqual({ ghs: 75, ngn: 1000 });
    expect(s.paymentsLast30d).toBe(3);
    expect(s.payingCustomers).toBe(2); // same person, different letter case
    expect(s.recurringKnown).toBe(false);
    expect(s.mrr).toEqual({});
  });
});

describe("Polar", () => {
  it("accepts organization access tokens only", () => {
    expect(checkPolarToken("polar_oat_" + "a".repeat(30)).ok).toBe(true);
    expect(checkPolarToken("sk_live_abc").ok).toBe(false);
  });
  it("converts every interval to a monthly amount", () => {
    expect(monthlyMinorPolar({ amount: 1000, recurring_interval: "month" })).toBe(1000);
    expect(monthlyMinorPolar({ amount: 12000, recurring_interval: "year" })).toBe(1000);
    expect(monthlyMinorPolar({ amount: 3000, recurring_interval: "month", recurring_interval_count: 3 })).toBe(1000);
    expect(monthlyMinorPolar({ amount: 0, recurring_interval: "month" })).toBe(0);
    expect(monthlyMinorPolar({ amount: 500, recurring_interval: null })).toBe(0);
  });
  it("counts only active subscriptions and paid, unrefunded orders", () => {
    const s = summarisePolar(
      [
        { status: "active", amount: 2900, currency: "usd", recurring_interval: "month", customer_id: "c1" },
        { status: "active", amount: 29000, currency: "usd", recurring_interval: "year", customer_id: "c2" },
        { status: "canceled", amount: 2900, currency: "usd", recurring_interval: "month", customer_id: "c3" },
      ],
      [
        { status: "paid", net_amount: 2900, currency: "usd", created_at: daysAgo(3) },
        { status: "paid", net_amount: 5000, refunded_amount: 5000, currency: "usd", created_at: daysAgo(4) },
        { status: "pending", net_amount: 9900, currency: "usd", created_at: daysAgo(1) },
        { status: "paid", net_amount: 2900, currency: "usd", created_at: daysAgo(60) },
      ],
      "live", NOW,
    );
    expect(s.payingCustomers).toBe(2);
    expect(s.mrr.usd).toBeCloseTo(29 + 29000 / 12 / 100, 1);
    expect(s.paymentsLast30d).toBe(1);
    expect(s.last30d).toEqual({ usd: 29 });
    expect(s.recurringKnown).toBe(true);
  });
});

describe("typed-in numbers", () => {
  it("validates and is marked self-reported", () => {
    expect(ManualRevenueSchema.safeParse({ payingCustomers: -1, currency: "GHS" }).success).toBe(false);
    expect(ManualRevenueSchema.safeParse({ payingCustomers: 2, currency: "cedis" }).success).toBe(false);
    const ok = ManualRevenueSchema.parse({ payingCustomers: 3, mrr: 150, currency: "ghs", paymentsLast30d: 4 });
    const s = summariseManual(ok, NOW);
    expect(s.selfReported).toBe(true);
    expect(s.mrr).toEqual({ ghs: 150 });
    expect(revenueFacts(s)[0].label).toMatch(/typed in by you/);
  });
  it("recognises the revenue providers", () => {
    for (const p of ["stripe", "polar", "paystack", "revenue_manual"]) expect(isRevenueProvider(p)).toBe(true);
    expect(isRevenueProvider("github")).toBe(false);
  });
});

describe("planner steering across payment tools", () => {
  const pay = summarisePaystack([], "live", NOW);
  it("treats no payments in any tool as no money yet", () => {
    const polar = summarisePolar([], [], "live", NOW);
    expect(steeringBlock({ revenue: [pay, polar], shipped: [] })).toMatch(/Paystack and Polar.*0 paying customers/);
  });
  it("reports each tool and never shows unknown MRR as 0", () => {
    const real = summarisePaystack([{ status: "success", amount: 10000, currency: "GHS", paid_at: daysAgo(1), customer: { email: "a@x.com" } }], "live", NOW);
    const b = steeringBlock({ revenue: [real], shipped: [] });
    expect(b).toMatch(/Paystack/);
    expect(b).not.toMatch(/MRR/);
    expect(b).toMatch(/customers who paid/);
  });
  it("labels typed-in numbers as self-reported", () => {
    const m = summariseManual({ payingCustomers: 2, mrr: 80, currency: "usd", paymentsLast30d: 2 }, NOW);
    expect(steeringBlock({ revenue: [m], shipped: [] })).toMatch(/self-reported/);
  });
});
