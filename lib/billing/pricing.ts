import type { Plan } from "@/lib/plan";

/**
 * USD price per plan — single source of truth for checkout AND webhook
 * amount validation. Previously this lived only in app/api/billing/checkout/route.ts;
 * moved here so the webhook can validate founding-member discounted charges
 * against the exact same numbers instead of a second, possibly-drifted copy.
 */
export const PLAN_PRICE_USD: Record<Plan, number> = {
  free: 0,
  builder: 39,
};

/** USD price in cents for Paystack (USD-billed plan) */
export const PLAN_PRICE_CENTS: Record<Plan, number> = {
  free: 0,
  builder: 3900, // $39.00
};

/**
 * FOUNDING MEMBER DISCOUNT
 * Locked in forever for anyone who pre-committed via the quiz and later
 * creates an account. This is a discount, not free access — see the
 * reasoning in app/auth/callback/route.ts: free-forever access from an
 * unknown-cost AI pipeline is an open-ended liability; a locked discount
 * still rewards early believers without that risk.
 *
 * Change this single number to adjust the discount for all future founding
 * conversions. It does not retroactively change already-converted members'
 * price (their amount was already charged and stored).
 */
export const FOUNDING_DISCOUNT_MULTIPLIER = 0.5; // 50% off, forever

export function foundingPriceUsd(plan: Plan): number {
  return Math.round(PLAN_PRICE_USD[plan] * FOUNDING_DISCOUNT_MULTIPLIER * 100) / 100;
}

export function foundingPriceCents(plan: Plan): number {
  return Math.round(PLAN_PRICE_CENTS[plan] * FOUNDING_DISCOUNT_MULTIPLIER);
}
