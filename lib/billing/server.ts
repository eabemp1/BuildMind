import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan, type Plan } from "@/lib/plan";
import { decideAccessAfterCancel, PAYMENT_GRACE_DAYS, type AccessDecision } from "@/lib/billing/cancellation";

export type PublicPlan = Extract<Plan, "free" | "builder">;

type BillingUpdate = {
  provider?: "paystack" | "stripe" | "polar";
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
  /** FOUNDING MEMBER FIX: when true, skips the 30-day auto-renewal period —
   *  this access does not expire and is never charged again. */
  isLifetime?: boolean;
  /** FOUNDING MEMBER FIX: tags the subscriptions row so the badge/roadmap-input
   *  surface can read it directly without joining another table. */
  isFoundingMember?: boolean;
  /** When set, the user has cancelled but keeps access until periodEnd.
   *  Pass null to clear a scheduled cancellation (resume). */
  canceledAt?: string | null;
};

const MONTHLY_PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function sanitizePlan(value: unknown): PublicPlan {
  return normalizePlan(typeof value === "string" ? value : null) === "builder" ? "builder" : "free";
}

function addMonthlyPeriod(startIso: string): string {
  return new Date(new Date(startIso).getTime() + MONTHLY_PERIOD_MS).toISOString();
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

/**
 * markFoundingEligible — used by app/auth/callback/route.ts when a user's
 * email matches an unconverted founding_members row.
 *
 * IMPORTANT: this does NOT grant free access. It only flags the user as
 * eligible for the discounted founding price at checkout (see
 * lib/billing/pricing.ts). Their actual plan/status is untouched — if they
 * were on "free", they stay on "free" until they pay the discounted rate.
 * This avoids the free-forever liability of an unknown-cost AI pipeline
 * while still honoring the "lifetime founder pricing" promise.
 */
export async function markFoundingEligible(userId: string, email: string | null) {
  const supabase = createAdminClient();
  const nowIso = new Date().toISOString();

  // Only set is_founding_member/founding_member_since — do NOT touch plan or
  // status. If no subscriptions row exists yet, this creates one defaulted to
  // "free" (the table's own DEFAULT), which is correct for a brand-new user.
  const { error } = await supabase
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        customer_email: email,
        is_founding_member: true,
        founding_member_since: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "user_id", ignoreDuplicates: false },
    );

  if (error) {
    throw new Error(`[billing/markFoundingEligible] upsert failed: ${error.message}`);
  }
}

export async function persistUserPlan(userId: string, plan: PublicPlan, update: BillingUpdate = {}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error) throw new Error(error.message);

  // Preserve existing founding-member status unless this call explicitly sets it —
  // otherwise an unrelated billing event (e.g. a future webhook type) would
  // silently overwrite is_founding_member back to false on upsert.
  let existingFoundingMember = false;
  let existingFoundingSince: string | null = null;
  if (update.isFoundingMember === undefined) {
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("is_founding_member, founding_member_since")
      .eq("user_id", userId)
      .maybeSingle();
    existingFoundingMember = existingSub?.is_founding_member ?? false;
    existingFoundingSince = existingSub?.founding_member_since ?? null;
  }

  const existingMetadata = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const status = update.status ?? (plan === "builder" ? "active" : "free");
  const nowIso = new Date().toISOString();
  const billingPeriodStart = update.periodStart ?? (plan === "builder" && status === "active" ? nowIso : null);
  const billingPeriodEnd = update.isLifetime
    ? null
    : update.periodEnd ?? (billingPeriodStart ? addMonthlyPeriod(billingPeriodStart) : null);
  const nextMetadata: Record<string, unknown> = {
    ...existingMetadata,
    ...(update.meta ?? {}),
    plan,
    billing_provider: update.provider ?? existingMetadata.billing_provider ?? null,
    billing_status: status,
    billing_reference:
      update.reference !== undefined ? update.reference : existingMetadata.billing_reference ?? null,
    billing_transaction_id:
      update.transactionId !== undefined ? update.transactionId : existingMetadata.billing_transaction_id ?? null,
    billing_subscription_id:
      update.subscriptionId !== undefined ? update.subscriptionId : existingMetadata.billing_subscription_id ?? null,
    billing_customer_email:
      update.customerEmail !== undefined ? update.customerEmail : existingMetadata.billing_customer_email ?? null,
    billing_current_period_start: billingPeriodStart,
    billing_current_period_end: billingPeriodEnd,
    billing_updated_at: nowIso,
    billing_cancel_at_period_end: plan === "builder" && Boolean(update.canceledAt),
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
    status,
    provider:                 update.provider ?? null,
    provider_subscription_id: update.subscriptionId ?? null,
    provider_customer_id:     update.customerId ?? null,
    provider_reference:       update.reference ?? null,
    current_period_start:     billingPeriodStart,
    current_period_end:       billingPeriodEnd,
    grace_period_ends_at:     update.gracePeriodEndsAt ?? (update.meta?.grace_period_ends_at as string | null) ?? null,
    canceled_at:              update.canceledAt !== undefined
      ? update.canceledAt
      : update.status === "canceled" ? new Date().toISOString() : null,
    customer_email:           update.customerEmail ?? null,
    amount_minor:             update.amountMinor ?? null,
    currency:                 update.currency ?? "GHS",
    is_founding_member:       update.isFoundingMember ?? existingFoundingMember,
    founding_member_since:    update.isFoundingMember ? nowIso : existingFoundingSince,
    updated_at:               nowIso,
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


// ── Cancellation / grace helpers ─────────────────────────────────────────────

type SubscriptionSnapshot = {
  plan: string | null;
  status: string | null;
  provider: "paystack" | "stripe" | "polar" | null;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  providerReference: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  canceledAt: string | null;
  amountMinor: number | null;
  currency: string | null;
};

export async function getSubscriptionSnapshot(userId: string): Promise<SubscriptionSnapshot | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, provider, provider_subscription_id, provider_customer_id, provider_reference, current_period_start, current_period_end, canceled_at, amount_minor, currency")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`[billing/getSubscriptionSnapshot] ${error.message}`);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v ? v : null);
  const provider = str(row.provider);
  return {
    plan: str(row.plan),
    status: str(row.status),
    provider: provider === "paystack" || provider === "stripe" || provider === "polar" ? provider : null,
    providerSubscriptionId: str(row.provider_subscription_id),
    providerCustomerId: str(row.provider_customer_id),
    providerReference: str(row.provider_reference),
    periodStart: str(row.current_period_start),
    periodEnd: str(row.current_period_end),
    canceledAt: str(row.canceled_at),
    amountMinor: typeof row.amount_minor === "number" ? row.amount_minor : null,
    currency: str(row.currency),
  };
}

/** Everything persistUserPlan would otherwise reset to null on a re-write. */
function carryOver(snap: SubscriptionSnapshot | null): BillingUpdate {
  if (!snap) return {};
  return {
    provider: snap.provider ?? undefined,
    reference: snap.providerReference,
    subscriptionId: snap.providerSubscriptionId,
    customerId: snap.providerCustomerId,
    amountMinor: snap.amountMinor,
    currency: snap.currency,
  };
}

/**
 * Cancel without taking away time that was already paid for.
 *  - Period still running: stay on Builder (status "active") until the period
 *    ends, flagged as cancelled so the UI and emails can say so.
 *  - Nothing left to honour: drop to Free now.
 * Safe to call more than once (Paystack sends several events per cancellation).
 */
export async function scheduleCancellation(
  userId: string,
  opts: { reason?: string | null; email?: string | null } = {},
): Promise<{ decision: AccessDecision; alreadyScheduled: boolean }> {
  const snap = await getSubscriptionSnapshot(userId);
  const decision = decideAccessAfterCancel(snap?.periodEnd ?? null);
  const nowIso = new Date().toISOString();
  const alreadyScheduled = Boolean(snap?.canceledAt) && (snap?.plan !== "builder" || snap?.status === "active" || snap?.status === "canceled");
  const meta = { billing_canceled_at: nowIso, billing_cancel_reason: opts.reason ?? null };

  if (decision.mode === "until_period_end") {
    await persistUserPlan(userId, "builder", {
      ...carryOver(snap),
      status: "active",
      periodStart: snap?.periodStart ?? null,
      periodEnd: decision.accessUntil,
      canceledAt: snap?.canceledAt ?? nowIso,
      customerEmail: opts.email ?? null,
      meta,
    });
  } else {
    await persistUserPlan(userId, "free", {
      ...carryOver(snap),
      status: "canceled",
      customerEmail: opts.email ?? null,
      meta,
    });
  }
  return { decision, alreadyScheduled };
}

/** Undo a scheduled cancellation while the paid period is still running. */
export async function clearScheduledCancellation(userId: string): Promise<boolean> {
  const snap = await getSubscriptionSnapshot(userId);
  if (!snap || snap.plan !== "builder" || !snap.canceledAt) return false;
  if (decideAccessAfterCancel(snap.periodEnd).mode !== "until_period_end") return false;
  await persistUserPlan(userId, "builder", {
    ...carryOver(snap),
    status: "active",
    periodStart: snap.periodStart,
    periodEnd: snap.periodEnd,
    canceledAt: null,
  });
  return true;
}

/**
 * A renewal payment failed. Keep Builder for a short grace window instead of
 * cutting access the same minute (cards fail for boring reasons).
 */
export async function startPaymentGrace(userId: string, opts: { email?: string | null; reason?: string } = {}): Promise<string> {
  const snap = await getSubscriptionSnapshot(userId);
  const graceEnds = new Date(Date.now() + PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await persistUserPlan(userId, "builder", {
    ...carryOver(snap),
    status: "grace",
    gracePeriodEndsAt: graceEnds,
    periodStart: snap?.periodStart ?? null,
    periodEnd: snap?.periodEnd ?? graceEnds,
    customerEmail: opts.email ?? null,
    meta: { grace_period_ends_at: graceEnds, grace_reason: opts.reason ?? "payment_failed" },
  });
  return graceEnds;
}
