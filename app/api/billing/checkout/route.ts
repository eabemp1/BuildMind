import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan, type Plan } from "@/lib/plan";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { usdToPesewas } from "@/lib/fx";
import { PLAN_PRICE_USD, PLAN_PRICE_CENTS, foundingPriceUsd, foundingPriceCents } from "@/lib/billing/pricing";
import { createPolarCheckout } from "@/lib/billing/polar";

/**
 * Countries billed in GHS via the local Paystack plan.
 * Everyone else is billed in USD.
 */
const GHS_COUNTRIES = new Set(["GH", "GHANA"]);

/**
 * Paystack plan code — set this in your env. GHS only now; USD/international
 * traffic routes through Polar (see lib/billing/polar.ts) since Paystack has
 * not approved international payments on this account.
 *
 * FOUNDING NOTE: Paystack bills recurring subscriptions at the PLAN's
 * configured price, not the one-off "amount" sent at initialize — so
 * founding members need their OWN plan code at the discounted price, or
 * their renewal after month one silently jumps back to full price. Create
 * a second plan on your Paystack dashboard (GHS) at the discounted amount
 * from lib/billing/pricing.ts and set PAYSTACK_FOUNDING_PLAN_CODE. Until you
 * do, this falls back to the regular plan code with a console warning — the
 * FIRST charge will still be correct (we control that amount directly), but
 * renewals won't be discounted.
 */
const PLAN_CODES = {
  ghs: () => process.env.PAYSTACK_BUILDER_PLAN_CODE?.trim(),
  foundingGhs: () => process.env.PAYSTACK_FOUNDING_PLAN_CODE?.trim(),
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
  const baseUrl = appUrl(req);

  // ── International (non-Ghana) — route through Polar ─────────────────────
  // FIX: previously attempted a Paystack USD charge here, which silently
  // failed for every non-Ghana customer because Paystack has not approved
  // international payments on this account (a pending compliance review, not
  // a code issue). Polar acts as Merchant of Record and handles global cards
  // + tax compliance directly, so this path no longer depends on that
  // approval at all.
  if (!isGhs) {
    const amountCents = isFoundingMember ? foundingPriceCents(plan) : PLAN_PRICE_CENTS[plan];
    try {
      const checkout = await createPolarCheckout({
        userId: user.id,
        email: user.email,
        successUrl: `${baseUrl}/upgrade`,
        amountCents,
        plan,
        isFoundingMember,
      });
      return NextResponse.json({ url: checkout.url, plan, recurring: true, currency: "USD" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create checkout session";
      console.error("[checkout] Polar checkout failed:", msg);
      return NextResponse.json({ error: msg }, { status: 502 });
    }
  }

  // ── Ghana — unchanged, still Paystack ───────────────────────────────────
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY." },
      { status: 503 },
    );
  }

  // Local (Ghana) — convert $39 (or discounted price) to pesewas at live BoG rate
  const { pesewas, rateUsed, source } = await usdToPesewas(usdPrice);
  const amount = pesewas;
  const currency = "GHS";
  let paystackPlanCode = isFoundingMember ? PLAN_CODES.foundingGhs() : PLAN_CODES.ghs();
  if (isFoundingMember && !paystackPlanCode) {
    console.warn("[checkout] PAYSTACK_FOUNDING_PLAN_CODE not set — founding member's renewal will bill at full price after month one.");
    paystackPlanCode = PLAN_CODES.ghs();
  }
  const fxMeta = { fx_rate: rateUsed, fx_source: source };
  console.log(`[checkout] GHS path — $${usdPrice} → ${pesewas} pesewas (rate: ${rateUsed ?? "n/a"}, source: ${source})`);

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
