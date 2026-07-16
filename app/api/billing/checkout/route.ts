import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan, type Plan } from "@/lib/plan";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { usdToPesewas } from "@/lib/fx";
import { PLAN_PRICE_USD, PLAN_PRICE_CENTS, foundingPriceUsd, foundingPriceCents } from "@/lib/billing/pricing";

/**
 * Countries billed in GHS via the local Paystack plan.
 * Everyone else is billed in USD.
 */
const GHS_COUNTRIES = new Set(["GH", "GHANA"]);

/**
 * Paystack plan codes — set these in your env.
 * GHS plan: create on Paystack dashboard in GHS (we update periodically).
 * USD plan: create on Paystack dashboard in USD (stable, no conversion needed).
 *
 * FOUNDING NOTE: Paystack bills recurring subscriptions at the PLAN's
 * configured price, not the one-off "amount" sent at initialize — so
 * founding members need their OWN plan codes at the discounted price, or
 * their renewal after month one silently jumps back to full price. Create
 * two more plans on your Paystack dashboard (GHS + USD) at the discounted
 * amount from lib/billing/pricing.ts and set these env vars. Until you do,
 * this falls back to the regular plan code with a console warning — the
 * FIRST charge will still be correct (we control that amount directly), but
 * renewals won't be discounted.
 */
const PLAN_CODES = {
  ghs: () => process.env.PAYSTACK_BUILDER_PLAN_CODE?.trim(),
  usd: () => process.env.PAYSTACK_BUILDER_PLAN_CODE_USD?.trim(),
  foundingGhs: () => process.env.PAYSTACK_FOUNDING_PLAN_CODE?.trim(),
  foundingUsd: () => process.env.PAYSTACK_FOUNDING_PLAN_CODE_USD?.trim(),
};

const PURCHASABLE_PLANS: Plan[] = ["builder"];

function appUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

/**
 * Detect whether the request comes from a GHS-billed country.
 * Uses Vercel's geo header when available, falls back to the request body.
 */
function normalizeCountry(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function resolveCountry(req: Request, body: Record<string, unknown>): string {
  // Vercel sets this header automatically in production
  const geoCountry = normalizeCountry(req.headers.get("x-vercel-ip-country"));
  if (geoCountry) return geoCountry;

  // Fallback: client can send { country: "GH" } in the request body
  return normalizeCountry(body?.country);
}

export async function POST(req: Request) {
  const ipLimit = await rateLimitAsync(`checkout:ip:${getClientIp(req)}`, 30, 15 * 60 * 1000, { failClosed: true });
  if (!ipLimit.ok) {
    return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  }

  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userLimit = await rateLimitAsync(`checkout:user:${user.id}`, 10, 15 * 60 * 1000, { failClosed: true });
  if (!userLimit.ok) {
    return NextResponse.json({ error: "Too many checkout attempts. Try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedPlan = normalizePlan(body?.plan as string | undefined);
  const plan: Plan = PURCHASABLE_PLANS.includes(requestedPlan) ? requestedPlan : "builder";

  // ── Founding-member discount ────────────────────────────────────────────
  // Look up whether this user was flagged eligible in app/auth/callback/route.ts
  // (via markFoundingEligible). This is a read of their OWN status only —
  // never trust a client-supplied "I'm a founding member" flag for pricing.
  const admin = createAdminClient();
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("is_founding_member")
    .eq("user_id", user.id)
    .maybeSingle();
  const isFoundingMember = Boolean(subRow?.is_founding_member);

  const usdPrice = isFoundingMember ? foundingPriceUsd(plan) : PLAN_PRICE_USD[plan];
  if (!usdPrice || usdPrice <= 0) {
    return NextResponse.json({ error: `Plan "${plan}" is not purchasable` }, { status: 400 });
  }

  // ── Currency routing ────────────────────────────────────────────────────────
  const country = resolveCountry(req, body);
  const isGhs = GHS_COUNTRIES.has(country);

  let amount: number;
  let currency: "GHS" | "USD";
  let paystackPlanCode: string | undefined;
  let fxMeta: Record<string, unknown> = {};

  if (isGhs) {
    // Local (Ghana) — convert $39 (or discounted price) to pesewas at live BoG rate
    const { pesewas, rateUsed, source } = await usdToPesewas(usdPrice);
    amount = pesewas;
    currency = "GHS";
    paystackPlanCode = isFoundingMember ? PLAN_CODES.foundingGhs() : PLAN_CODES.ghs();
    if (isFoundingMember && !paystackPlanCode) {
      console.warn("[checkout] PAYSTACK_FOUNDING_PLAN_CODE not set — founding member's renewal will bill at full price after month one.");
      paystackPlanCode = PLAN_CODES.ghs();
    }
    fxMeta = { fx_rate: rateUsed, fx_source: source };
    console.log(`[checkout] GHS path — $${usdPrice} → ${pesewas} pesewas (rate: ${rateUsed ?? "n/a"}, source: ${source})`);
  } else {
    // Global — charge in USD directly, no conversion needed
    amount = isFoundingMember ? foundingPriceCents(plan) : PLAN_PRICE_CENTS[plan];
    currency = "USD";
    paystackPlanCode = isFoundingMember ? PLAN_CODES.foundingUsd() : PLAN_CODES.usd();
    if (isFoundingMember && !paystackPlanCode) {
      console.warn("[checkout] PAYSTACK_FOUNDING_PLAN_CODE_USD not set — founding member's renewal will bill at full price after month one.");
      paystackPlanCode = PLAN_CODES.usd();
    }
    console.log(`[checkout] USD path — $${usdPrice} → ${amount} cents${isFoundingMember ? " (founding discount)" : ""}`);
  }

  const baseUrl = appUrl(req);
  const paystackBody = {
    email: user.email,
    amount,
    currency,
    ...(paystackPlanCode ? { plan: paystackPlanCode } : {}),
    callback_url: `${baseUrl}/upgrade`,
    metadata: {
      user_id: user.id,
      plan,
      billing_interval: "monthly",
      billing_currency: currency,
      billing_country: country || "unknown",
      founding_member: isFoundingMember,
      ...fxMeta,
    },
  };

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${paystackSecretKey}`,
    },
    body: JSON.stringify(paystackBody),
  });

  const payload = (await res.json().catch(() => ({}))) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string };
  };

  if (!res.ok || !payload.status || !payload.data?.authorization_url) {
    return NextResponse.json(
      { error: payload.message ?? "Could not create checkout session" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url: payload.data.authorization_url, plan, recurring: true, currency });
}
