import { Webhooks } from "@polar-sh/nextjs";
import { persistUserPlan, resolveUserIdByEmail } from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";

/**
 * app/api/billing/polar/webhook/route.ts
 *
 * Handles Polar events for international (non-Ghana) checkout — the
 * counterpart to app/api/billing/paystack/webhook/route.ts. Both funnel
 * into the SAME persistUserPlan(), so downstream code (plan gates, the
 * founding-member badge, AI usage quotas) doesn't need to know which
 * processor a given user paid through.
 *
 * @polar-sh/nextjs's Webhooks() adapter verifies the signature for us
 * (using POLAR_WEBHOOK_SECRET) — no manual HMAC code needed, unlike the
 * Paystack webhook which verifies by hand.
 */

function resolveUserId(payload: {
  data: { metadata?: Record<string, unknown> | null; customer?: { externalId?: string | null; email?: string | null } | null };
}): { userId: string | null; email: string | null } {
  const metaUserId = payload.data.metadata?.user_id;
  const userId =
    (typeof metaUserId === "string" && metaUserId.trim()) ||
    payload.data.customer?.externalId ||
    null;
  const email = payload.data.customer?.email?.trim().toLowerCase() ?? null;
  return { userId, email };
}

async function isFoundingCharge(
  metadata: Record<string, unknown> | null | undefined,
  userId: string | null,
): Promise<boolean> {
  const metaFlag = metadata?.founding_member;
  if (metaFlag === true || metaFlag === "true") return true;
  if (!userId) return false;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("subscriptions")
      .select("is_founding_member")
      .eq("user_id", userId)
      .maybeSingle();
    return Boolean(data?.is_founding_member);
  } catch {
    return false;
  }
}

async function grantAccess(payload: {
  data: {
    id?: string;
    amount?: number | null;
    currency?: string | null;
    metadata?: Record<string, unknown> | null;
    customer?: { externalId?: string | null; email?: string | null } | null;
    subscriptionId?: string | null;
  };
}) {
  const { userId: metaUserId, email } = resolveUserId(payload);
  let userId = metaUserId;

  // Fallback: resolve by email if metadata/externalId didn't carry a user_id
  // (shouldn't normally happen — we always pass externalCustomerId + metadata
  // at checkout — but mirrors the Paystack webhook's defensive fallback).
  if (!userId && email) {
    userId = await resolveUserIdByEmail(email);
  }

  if (!userId) {
    logError("polar-webhook/grantAccess", new Error("Could not resolve user_id for Polar event"), {
      polarObjectId: payload.data.id,
      email,
    });
    return;
  }

  const founding = await isFoundingCharge(payload.data.metadata, userId);

  await persistUserPlan(userId, "builder", {
    provider: "polar",
    status: "active",
    reference: payload.data.id ?? null,
    subscriptionId: payload.data.subscriptionId ?? null,
    customerEmail: email,
    amountMinor: payload.data.amount ?? null,
    currency: (payload.data.currency ?? "USD").toUpperCase(),
    isFoundingMember: founding,
    meta: { billing_interval: "monthly", source: "polar" },
  });
}

export const POST = Webhooks({
  webhookSecret: process.env.POLAR_WEBHOOK_SECRET!,

  // Fires once a checkout's order is actually paid — the reliable signal
  // for "grant access now," same role as Paystack's charge.success.
  onOrderPaid: async (payload) => {
    try {
      await grantAccess(payload);
    } catch (err) {
      logError("polar-webhook/onOrderPaid", err);
    }
  },

  // Fires when Polar creates the recurring subscription object — covers the
  // case where subscription creation and order-paid don't land in the same
  // event (defensive redundancy; persistUserPlan is idempotent-safe to call
  // twice with the same state).
  onSubscriptionCreated: async (payload) => {
    try {
      await grantAccess(payload);
    } catch (err) {
      logError("polar-webhook/onSubscriptionCreated", err);
    }
  },

  // Subscription canceled/revoked — downgrade back to free. Does NOT touch
  // is_founding_member (that's a permanent discount-eligibility flag, not
  // tied to whether they currently have an active subscription).
  onSubscriptionRevoked: async (payload) => {
    try {
      const { userId: metaUserId, email } = resolveUserId(payload);
      const userId = metaUserId ?? (email ? await resolveUserIdByEmail(email) : null);
      if (!userId) return;
      await persistUserPlan(userId, "free", {
        provider: "polar",
        status: "canceled",
        customerEmail: email,
        meta: { source: "polar", reason: "subscription_revoked" },
      });
    } catch (err) {
      logError("polar-webhook/onSubscriptionRevoked", err);
    }
  },
});
