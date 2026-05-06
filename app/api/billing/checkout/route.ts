import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePlan, type Plan } from "@/lib/plan";

/**
 * Amount config per plan tier (in pesewas / kobo / cents depending on currency).
 *
 * Fixed the dead-code branch that previously always resolved to "builder"
 * regardless of what the client sent:
 *   const plan = body?.plan === "builder" ? "builder" : "builder";  // DEAD
 *
 * Now correctly reads the plan from the request body, validates it against
 * the known tiers, and uses the corresponding amount env var.
 *
 * Adding a new tier: set PAYSTACK_AMOUNT_<TIER_UPPER> in env and add an entry
 * below. The checkout route will automatically pick it up.
 */
const PLAN_AMOUNTS: Record<Plan, () => number> = {
  free:    () => 0,
  builder: () => parseInt(
    process.env.PAYSTACK_AMOUNT_BUILDER ??
    process.env.PAYSTACK_AMOUNT_PESEWAS ??
    "29000",
    10,
  ),
};

/** Plans that can actually be purchased (free is not purchasable). */
const PURCHASABLE_PLANS: Plan[] = ["builder"];

function appUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_URL ??
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!paystackSecretKey) {
    return NextResponse.json(
      { error: "Paystack is not configured. Add PAYSTACK_SECRET_KEY." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // ── Fix 3: Correctly resolve the target plan from the request body ─────────
  // Previously: const plan = body?.plan === "builder" ? "builder" : "builder";
  // Both branches returned "builder" — the plan param was silently ignored.
  // Now: validate against PURCHASABLE_PLANS so new tiers just work.
  const requestedPlan = normalizePlan(body?.plan as string | undefined);
  const plan: Plan = PURCHASABLE_PLANS.includes(requestedPlan)
    ? requestedPlan
    : "builder"; // safe default for the single current paid tier

  const amount = PLAN_AMOUNTS[plan]?.();
  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: `Plan "${plan}" is not purchasable` },
      { status: 400 },
    );
  }

  const baseUrl = appUrl(req);

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${paystackSecretKey}`,
    },
    body: JSON.stringify({
      email: user.email,
      amount,
      currency: "GHS",
      callback_url: `${baseUrl}/upgrade`,
      metadata: { user_id: user.id, plan },
    }),
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

  return NextResponse.json({ url: payload.data.authorization_url, plan });
}
