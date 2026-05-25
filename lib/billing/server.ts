import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan, type Plan } from "@/lib/plan";

export type PublicPlan = Extract<Plan, "free" | "builder">;

type BillingUpdate = {
  provider?: "paystack" | "stripe";
  status?: "active" | "canceled" | "processing" | "free" | "grace";
  reference?: string | null;
  transactionId?: string | null;
  subscriptionId?: string | null;
  customerEmail?: string | null;
  customerId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  gracePeriodEndsAt?: string | null;
  amountMinor?: number | null;
  currency?: string | null;
  meta?: Record<string, unknown>;
};

function sanitizePlan(value: unknown): PublicPlan {
  return normalizePlan(typeof value === "string" ? value : null) === "builder" ? "builder" : "free";
}

export function getBillingEnvStatus() {
  return {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseAnonKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    paystackPublicKey: Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY),
    paystackSecretKey: Boolean(process.env.PAYSTACK_SECRET_KEY),
    groqApiKey: Boolean(process.env.GROQ_API_KEY),
    posthogKey: Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY),
  };
}

export async function resolveUserIdByEmail(email: string | null | undefined): Promise<string | null> {
  if (!email) return null;
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return (data as { id?: string } | null)?.id ?? null;
}

export async function getUserPlanById(userId: string): Promise<PublicPlan> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);
  return sanitizePlan(data.user?.user_metadata?.plan);
}

export async function persistUserPlan(userId: string, plan: PublicPlan, update: BillingUpdate = {}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);

  const existingMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const nextMetadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(update.meta ?? {}),
    plan,
    billing_provider: update.provider ?? existingMetadata.billing_provider ?? null,
    billing_status:
      update.status ?? (plan === "builder" ? "active" : "free"),
    billing_reference:
      update.reference !== undefined ? update.reference : existingMetadata.billing_reference ?? null,
    billing_transaction_id:
      update.transactionId !== undefined ? update.transactionId : existingMetadata.billing_transaction_id ?? null,
    billing_subscription_id:
      update.subscriptionId !== undefined ? update.subscriptionId : existingMetadata.billing_subscription_id ?? null,
    billing_customer_email:
      update.customerEmail !== undefined ? update.customerEmail : existingMetadata.billing_customer_email ?? null,
    billing_updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    user_metadata: nextMetadata,
  });
  if (updateError) throw new Error(updateError.message);

  // ── A2 FIX: subscriptions is now the canonical source of truth ────────────
  // Previous behaviour: three silent writes to user_metadata (primary),
  // subscriptions (silently swallowed on failure), and profiles (guaranteed
  // silent .then(undefined, undefined)). Any write failure left the stores
  // inconsistent with no reconciliation path.
  //
  // New behaviour:
  //   1. subscriptions table: PRIMARY write — throws on failure so the caller
  //      (webhook handler) can return a 500 and Paystack will retry.
  //   2. user_metadata: SECONDARY sync — kept for the JWT fast-path used by
  //      the client SDK. A failure here is logged but non-fatal: getEffectivePlan()
  //      will still read the correct plan from subscriptions on next server call.
  //   3. profiles: REMOVED — admin dashboard now reads from subscriptions directly.
  //
  // getEffectivePlan() in lib/server/plan.ts reads subscriptions first (see below).

  const subscriptionRow = {
    user_id:                  userId,
    plan,
    status:                   (update.status ?? (plan === "builder" ? "active" : "free")) as string,
    provider:                 update.provider ?? null,
    provider_subscription_id: update.subscriptionId ?? null,
    provider_customer_id:     update.customerId ?? null,
    provider_reference:       update.reference ?? null,
    current_period_start:     update.periodStart ?? null,
    current_period_end:       update.periodEnd ?? null,
    grace_period_ends_at:     update.gracePeriodEndsAt ?? (update.meta?.grace_period_ends_at as string | null) ?? null,
    canceled_at:              update.status === "canceled" ? new Date().toISOString() : null,
    customer_email:           update.customerEmail ?? null,
    amount_minor:             update.amountMinor ?? null,
    currency:                 update.currency ?? "GHS",
    updated_at:               new Date().toISOString(),
  };

  // PRIMARY write — must succeed or the whole operation fails (webhook will retry)
  const { error: subError } = await supabase
    .from("subscriptions")
    .upsert(subscriptionRow, { onConflict: "user_id" });
  if (subError) {
    throw new Error(`[billing/persistUserPlan] subscriptions upsert failed: ${subError.message}`);
  }

  // SECONDARY sync — user_metadata JWT cache. Non-fatal: a stale JWT is
  // corrected on the next getEffectivePlan() server read from subscriptions.
  try {
    const { error: metaError } = await supabase.auth.admin.updateUserById(userId, {
      user_metadata: nextMetadata,
    });
    if (metaError) {
      console.warn("[billing/persistUserPlan] user_metadata sync failed (non-fatal):", metaError.message);
    }
  } catch (err) {
    console.warn("[billing/persistUserPlan] user_metadata sync threw (non-fatal):", err instanceof Error ? err.message : err);
  }

  // profiles sync REMOVED (A2 fix) — was always silent and created desync.
  // Admin dashboard reads plan from subscriptions table directly.

  return {
    plan,
    metadata: nextMetadata,
  };
}
