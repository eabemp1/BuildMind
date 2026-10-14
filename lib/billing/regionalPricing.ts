import type { Plan } from "@/lib/plan";
import { FOUNDING_DISCOUNT_MULTIPLIER } from "@/lib/billing/pricing";

/**
 * Regional (purchasing-power) pricing.
 *
 * Big SaaS companies (Notion, Spotify, Figma, GitHub…) price by region
 * instead of discounting globally: the same product, a price that matches
 * local purchasing power, so a market that would never pay $39 pays $15
 * instead of $0. Rules we follow:
 *
 *  1. The tier is decided SERVER-SIDE from the CDN geo header only. A
 *     client-supplied country is never trusted for price (it would be a
 *     discount code for anyone who edits a request).
 *  2. Fail safe: if a tier can't be fulfilled (e.g. the Ghana Paystack plan
 *     for that price isn't configured yet), fall back to the standard price
 *     rather than quote one price and charge another.
 *  3. Every webhook / verify amount floor uses the LOWEST tier, so a regional
 *     payment is never rejected as "underpaid".
 */

export type PriceTier = "standard" | "africa";

/** Monthly USD price per tier for the Builder plan. Change here only. */
export const TIER_PRICE_USD: Record<PriceTier, number> = {
  standard: 39,
  africa: 15,
};

/** ISO-3166 alpha-2 codes for the African continent. */
export const AFRICA_COUNTRIES: ReadonlySet<string> = new Set([
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CV", "CM", "CF", "TD", "KM", "CG", "CD",
  "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET", "GA", "GM", "GH", "GN", "GW", "KE",
  "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG",
  "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG",
  "ZM", "ZW",
]);

export function normalizeCountryCode(value: unknown): string {
  const v = String(value ?? "").trim().toUpperCase();
  return v === "GHANA" ? "GH" : v;
}

/** Tier for a trusted country code (from the geo header). Unknown → standard. */
export function tierForCountry(country: unknown): PriceTier {
  return AFRICA_COUNTRIES.has(normalizeCountryCode(country)) ? "africa" : "standard";
}

/** Env lookups kept injectable so they can be unit-tested. */
export type PricingEnv = Record<string, string | undefined>;

function env(e?: PricingEnv): PricingEnv {
  return e ?? (process.env as PricingEnv);
}

/**
 * Ghana is billed in GHS through Paystack subscription PLANS whose amount is
 * fixed on the Paystack dashboard (the plan amount overrides whatever we send
 * at initialize). A cheaper tier therefore needs its own plan code.
 */
export function ghsPlanCodes(e?: PricingEnv) {
  const x = env(e);
  return {
    standard: x.PAYSTACK_BUILDER_PLAN_CODE?.trim() || undefined,
    standardFounding: x.PAYSTACK_FOUNDING_PLAN_CODE?.trim() || undefined,
    africa: x.PAYSTACK_AFRICA_PLAN_CODE?.trim() || undefined,
    africaFounding: x.PAYSTACK_AFRICA_FOUNDING_PLAN_CODE?.trim() || undefined,
  };
}

/**
 * The tier we can actually honour for this country/provider.
 * Ghana (Paystack) needs PAYSTACK_AFRICA_PLAN_CODE, otherwise standard.
 * Other African countries go through Polar, whose price is set per checkout,
 * so they always get the regional tier.
 */
export function effectiveTier(country: unknown, e?: PricingEnv): PriceTier {
  const wanted = tierForCountry(country);
  if (wanted === "standard") return "standard";
  if (normalizeCountryCode(country) === "GH" && !ghsPlanCodes(e).africa) return "standard";
  return "africa";
}

export function tierPriceUsd(tier: PriceTier, founding: boolean, plan: Plan = "builder"): number {
  if (plan !== "builder") return 0;
  const base = TIER_PRICE_USD[tier];
  return founding ? Math.round(base * FOUNDING_DISCOUNT_MULTIPLIER * 100) / 100 : base;
}

export function tierPriceCents(tier: PriceTier, founding: boolean, plan: Plan = "builder"): number {
  return Math.round(tierPriceUsd(tier, founding, plan) * 100);
}

/** Lowest list price in cents across tiers — basis for every amount floor. */
export function lowestTierCents(): number {
  return Math.min(...Object.values(TIER_PRICE_USD)) * 100;
}

/** Ratio of lowest tier to the price the GHS env amount was configured for. */
export function lowestTierRatio(): number {
  return Math.min(...Object.values(TIER_PRICE_USD)) / TIER_PRICE_USD.standard;
}

/**
 * Pick the Paystack plan code for a Ghana checkout. Returns the plan code
 * (maybe undefined) and a warning when we had to fall back.
 */
export function pickGhsPlanCode(
  tier: PriceTier,
  founding: boolean,
  e?: PricingEnv,
): { planCode: string | undefined; warning?: string } {
  const c = ghsPlanCodes(e);
  if (tier === "africa") {
    if (founding) {
      if (c.africaFounding) return { planCode: c.africaFounding };
      return {
        planCode: c.africa,
        warning: "PAYSTACK_AFRICA_FOUNDING_PLAN_CODE not set — founding member's Africa plan bills at the regional price, no extra founding discount.",
      };
    }
    return { planCode: c.africa };
  }
  if (founding) {
    if (c.standardFounding) return { planCode: c.standardFounding };
    return {
      planCode: c.standard,
      warning: "PAYSTACK_FOUNDING_PLAN_CODE not set — founding member's renewal will bill at full price after month one.",
    };
  }
  return { planCode: c.standard };
}

export type PublicPrice = {
  tier: PriceTier;
  monthlyUsd: number;
  label: string;
  standardLabel: string;
  regional: boolean;
};

export function priceLabel(usd: number): string {
  return Number.isInteger(usd) ? `$${usd}/mo` : `$${usd.toFixed(2)}/mo`;
}

export function publicPrice(country: unknown, e?: PricingEnv): PublicPrice {
  const tier = effectiveTier(country, e);
  const monthlyUsd = TIER_PRICE_USD[tier];
  return {
    tier,
    monthlyUsd,
    label: priceLabel(monthlyUsd),
    standardLabel: priceLabel(TIER_PRICE_USD.standard),
    regional: tier !== "standard",
  };
}
