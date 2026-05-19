import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan, type Plan } from "@/lib/plan";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { usdToPesewas } from "@/lib/fx";

/**
 * Countries billed in GHS via the local Paystack plan.
 * Everyone else is billed in USD.
 */
const GHS_COUNTRIES = new Set(["GH", "GHANA"]);

/**
 * USD price per plan — single source of truth.
 * GHS is converted live from this at checkout.
 * USD plan charges this amount directly in dollars.
 */
const PLAN_PRICE_USD: Record<Plan, number> = {
  free:    0,
  builder: 39,
};

/** USD price in cents for Paystack (USD plan) */
const PLAN_PRICE_CENTS: Record<Plan, number> = {
  free:    0,
  builder: 3900, // $39.00
};

/**
 * Paystack plan codes — set these in your env.
 * GHS plan: create on Paystack dashboard in GHS (we update periodically).
 * USD plan: create on Paystack dashboard in USD (stable, no conversion needed).
 */
const PLAN_CODES = {
  ghs: () => process.env.PAYSTACK_BUILDER_PLAN_CODE?.trim(),
  usd: () => process.env.PAYSTACK_BUILDER_PLAN_CODE_USD?.trim(),
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

  const usdPrice = PLAN_PRICE_USD[plan];
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
    // Local (Ghana) — convert $39 to pesewas at live BoG rate
    const { pesewas, rateUsed, source } = await usdToPesewas(usdPrice);
    amount = pesewas;
    currency = "GHS";
    paystackPlanCode = PLAN_CODES.ghs();
    fxMeta = { fx_rate: rateUsed, fx_source: source };
    console.log(`[checkout] GHS path — $${usdPrice} → ${pesewas} pesewas (rate: ${rateUsed ?? "n/a"}, source: ${source})`);
  } else {
    // Global — charge in USD directly, no conversion needed
    amount = PLAN_PRICE_CENTS[plan];
    currency = "USD";
    paystackPlanCode = PLAN_CODES.usd();
    console.log(`[checkout] USD path — $${usdPrice} → ${amount} cents`);
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
