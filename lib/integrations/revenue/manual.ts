/**
 * For every payment tool BuildMind does not read (Flutterwave, Paddle, Lemon Squeezy, Gumroad, bank transfer, cash):
 * the founder types three numbers. Stored and shown as self-reported, never as verified.
 */
import { z } from "zod";
import type { RevenueSummary } from "./types";

export const ManualRevenueSchema = z.object({
  payingCustomers: z.number().int().min(0).max(1_000_000),
  mrr: z.number().min(0).max(1_000_000_000).default(0),
  currency: z.string().trim().regex(/^[A-Za-z]{3}$/, "Use a 3-letter currency code, for example GHS or USD."),
  paymentsLast30d: z.number().int().min(0).max(1_000_000).default(0),
});
export type ManualRevenue = z.infer<typeof ManualRevenueSchema>;

export function summariseManual(i: ManualRevenue, now = new Date()): RevenueSummary {
  const cur = i.currency.toLowerCase();
  return {
    provider: "revenue_manual", asOf: now.toISOString(), mode: "live", selfReported: true, recurringKnown: true,
    mrr: i.mrr > 0 ? { [cur]: Math.round(i.mrr * 100) / 100 } : {}, payingCustomers: i.payingCustomers,
    last30d: {}, paymentsLast30d: i.paymentsLast30d, truncated: false,
  };
}
