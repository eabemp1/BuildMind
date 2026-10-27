import { describe, it, expect } from "vitest";
import { steeringBlock } from "@/lib/integrations/steer";

const row = (query: string, position: number, impressions: number, clicks = 0) => ({ query, position, impressions, clicks, ctr: 0 });
const search = (o: Partial<{ nearMisses: ReturnType<typeof row>[]; unclicked: ReturnType<typeof row>[]; impressions: number }> = {}) => ({
  asOf: "2026-10-26T00:00:00Z", site: "sc-domain:buildmind.live", range: { start: "2026-09-26", end: "2026-10-23" },
  clicks: 0, impressions: o.impressions ?? 40, topQueries: [], nearMisses: o.nearMisses ?? [], unclicked: o.unclicked ?? [],
});
const stripe = (n: number, payments = 0) => ({ asOf: "2026-10-26T00:00:00Z", mode: "live" as const, mrr: n ? { usd: 29 * n } : {}, payingCustomers: n, last30d: {}, paymentsLast30d: payments, truncated: false });

describe("steeringBlock", () => {
  it("is empty with nothing connected", () => {
    expect(steeringBlock({ shipped: [] })).toBe("");
  });
  it("points a founder with no customers at a first payment", () => {
    const b = steeringBlock({ revenue: [{ ...stripe(0), provider: "stripe" as const }], shipped: [] });
    expect(b).toMatch(/0 paying customers/);
    expect(b).toMatch(/first payment/);
  });
  it("uses real numbers when there are customers, and flags test mode", () => {
    const b = steeringBlock({ revenue: [{ ...stripe(3, 3), mode: "test" as const, provider: "stripe" as const }], shipped: [] });
    expect(b).toMatch(/3 paying customers/);
    expect(b).toMatch(/TEST-mode/);
  });
  it("names near-miss queries and keeps search small when there are no customers", () => {
    const b = steeringBlock({ search: search({ nearMisses: [row("startup execution tool", 11.2, 90)] }), revenue: [{ ...stripe(0), provider: "stripe" as const }], shipped: [] });
    expect(b).toMatch(/startup execution tool/);
    expect(b).toMatch(/does not replace talking to customers/);
  });
  it("says search is not a channel yet when there are no impressions", () => {
    expect(steeringBlock({ search: search({ impressions: 0 }), shipped: [] })).toMatch(/not a channel yet/);
  });
  it("tells the planner what already shipped", () => {
    expect(steeringBlock({ shipped: ["Add Stripe webhook"] })).toMatch(/already shipped/);
  });
  it("never lets a query break out of its quotes", () => {
    expect(steeringBlock({ search: search({ nearMisses: [row('bad "quote" query', 12, 50)] }), shipped: [] })).not.toMatch(/"bad "quote"/);
  });
});
