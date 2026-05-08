import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePlan, type Plan } from "@/lib/plan";

export type PublicPlan = Extract<Plan, "free" | "builder">;

type BillingUpdate = {
  provider?: "paystack";
  status?: "active" | "canceled" | "processing" | "free";
  reference?: string | null;
  transactionId?: string | null;
  subscriptionId?: string | null;
  customerEmail?: string | null;
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

  await supabase
    .from("profiles")
    .update({ plan })
    .eq("id", userId)
    .then(() => undefined, () => undefined);

  return {
    plan,
    metadata: nextMetadata,
  };
}
