import type { StripeSummary } from "@/lib/integrations/stripe";

export const REVENUE_PROVIDERS = ["stripe", "polar", "paystack", "revenue_manual"] as const;
export type RevenueProvider = (typeof REVENUE_PROVIDERS)[number];
export const isRevenueProvider = (p: unknown): p is RevenueProvider => typeof p === "string" && (REVENUE_PROVIDERS as readonly string[]).includes(p);

export const REVENUE_LABEL: Record<RevenueProvider, string> = { stripe: "Stripe", polar: "Polar", paystack: "Paystack", revenue_manual: "Your numbers" };

/**
 * One shape for every payment tool, so nothing downstream (prepared work, the planner, Settings) cares which one the
 * founder uses. It extends the Stripe summary, which already held per-currency amounts in major units.
 */
export interface RevenueSummary extends StripeSummary {
  provider: RevenueProvider;
  /** False when the tool has no recurring-revenue notion (Paystack): `mrr` is then empty and must not be shown as 0. */
  recurringKnown?: boolean;
  /** True when the founder typed the numbers. Shown as such, never as verified. */
  selfReported?: boolean;
}

export type RevenueFetch = { ok: true; summary: RevenueSummary } | { ok: false; kind: "auth" | "permission" | "network"; message: string };
