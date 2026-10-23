import { describe, it, expect } from "vitest";
import { countPaymentsSince } from "@/lib/integrations/stripe";
import { paymentSignalFromCharges, detectPaymentSignal } from "@/lib/autoSignals";

const since = Date.parse("2026-10-20T00:00:00Z");
const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);
const ok = (iso: string, o: object = {}) => ({ created: ts(iso), paid: true, status: "succeeded", amount: 1000, amount_refunded: 0, currency: "usd", ...o });

describe("countPaymentsSince", () => {
  it("counts only successful, unrefunded charges after the moment", () => {
    const n = countPaymentsSince([
      ok("2026-10-21T00:00:00Z"),
      ok("2026-10-19T00:00:00Z"),
      ok("2026-10-21T00:00:00Z", { status: "failed", paid: false }),
      ok("2026-10-21T00:00:00Z", { amount_refunded: 1000 }),
      ok("2026-10-22T00:00:00Z", { amount_refunded: 400 }),
      { paid: true, status: "succeeded", amount: 500 },
    ], since);
    expect(n).toBe(2);
  });
});

describe("paymentSignalFromCharges", () => {
  it("returns null with no payments", () => {
    expect(paymentSignalFromCharges([], since)).toBeNull();
  });
  it("builds a payment signal with an honest note", () => {
    const r = paymentSignalFromCharges([ok("2026-10-21T00:00:00Z"), ok("2026-10-21T01:00:00Z")], since);
    expect(r?.signal).toEqual({ kind: "payment", count: 2 });
    expect(r?.note).toContain("2 payments");
  });
  it("marks truncated counts", () => {
    expect(paymentSignalFromCharges([ok("2026-10-21T00:00:00Z")], since, true)?.note).toContain("1+");
  });
});

describe("detectPaymentSignal", () => {
  it("never throws and returns null without Stripe", async () => {
    const admin: any = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) };
    expect(await detectPaymentSignal(admin, "u", "2026-10-20T00:00:00Z")).toBeNull();
    expect(await detectPaymentSignal({ from: () => { throw new Error("x"); } } as any, "u", "2026-10-20T00:00:00Z")).toBeNull();
    expect(await detectPaymentSignal(admin, "u", "not a date")).toBeNull();
  });
});
