import { Polar } from "@polar-sh/sdk";

/**
 * lib/billing/polar.ts — Polar.sh client (Merchant of Record)
 *
 * Used for ALL non-Ghana checkout, replacing the previously-blocked
 * Paystack-USD path (Paystack has not approved international payments on
 * this account — see app/api/billing/checkout/route.ts). Ghana/GHS traffic
 * stays on Paystack unchanged.
 *
 * Env vars required (already set up per your Polar dashboard):
 *   POLAR_ACCESS_TOKEN      — Organization Access Token
 *   POLAR_WEBHOOK_SECRET    — from the webhook you configured
 *   POLAR_BUILDER_PRODUCT_ID — Product ID for the Builder plan (from Polar dashboard → Products → copy Product ID)
 *   POLAR_SERVER            — "sandbox" while testing, "production" when live (defaults to production)
 */

let _polar: Polar | null = null;

export function getPolarClient(): Polar {
  if (_polar) return _polar;
  const accessToken = process.env.POLAR_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("[polar] POLAR_ACCESS_TOKEN is not set");
  }
  _polar = new Polar({
    accessToken,
    server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "production",
  });
  return _polar;
}

export type CreatePolarCheckoutParams = {
  userId: string;
  email: string;
  successUrl: string;
  /** USD price in cents to charge THIS checkout. */
  amountCents: number;
  plan: string;
  isFoundingMember: boolean;
};

/**
 * createPolarCheckout — creates a checkout session for the Builder plan.
 *
 * FOUNDING DISCOUNT: uses Polar's ad-hoc price override at checkout time
 * (the `prices` param) instead of needing a second, separately-created
 * "founding" Product like Paystack required. This sets the price for THIS
 * checkout only.
 *
 * ⚠️ UNVERIFIED FOR RENEWALS: Polar's docs describe ad-hoc prices as
 * "temporary and specific to the checkout session," which is clear for the
 * FIRST charge, but I could not confirm from current docs whether a
 * recurring subscription's later renewals continue billing at that ad-hoc
 * amount or revert to the product's catalog price. This is the exact same
 * risk flagged for Paystack's plan codes. Recommend testing a founding
 * checkout in Polar's sandbox and watching what a simulated renewal charges
 * before your first real founding member converts through this path — if
 * renewals revert to full price, create a second, permanently-discounted
 * Product in the Polar dashboard instead (mirroring the Paystack approach)
 * and swap POLAR_BUILDER_PRODUCT_ID logic below to select between them.
 */
export async function createPolarCheckout(params: CreatePolarCheckoutParams) {
  const polar = getPolarClient();
  const productId = process.env.POLAR_BUILDER_PRODUCT_ID?.trim();
  if (!productId) {
    throw new Error("[polar] POLAR_BUILDER_PRODUCT_ID is not set");
  }

  const checkout = await polar.checkouts.create({
    products: [productId],
    ...(params.isFoundingMember
      ? {
          prices: {
            [productId]: [
              {
                amountType: "fixed" as const,
                priceAmount: params.amountCents,
                priceCurrency: "usd",
              },
            ],
          },
        }
      : {}),
    customerEmail: params.email,
    externalCustomerId: params.userId,
    successUrl: `${params.successUrl}?checkout_id={CHECKOUT_ID}`,
    metadata: {
      user_id: params.userId,
      plan: params.plan,
      founding_member: params.isFoundingMember,
    },
  });

  return checkout;
}
