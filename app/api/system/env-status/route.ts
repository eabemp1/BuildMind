import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBillingEnvStatus } from "@/lib/billing/server";
import { getAIProviderStatus } from "@/lib/ai-providers";

function hasRealSecret(name: string): boolean {
  const value = process.env[name]?.trim();
  if (!value) return false;
  const lowered = value.toLowerCase();
  return !(
    lowered === "your_key_here" ||
    lowered === "your_key" ||
    lowered.startsWith("your_key_from") ||
    lowered.includes("replace_me")
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Admin check is server-side via profiles.is_admin (service-role key).
  // NEXT_PUBLIC_ADMIN_USER_ID is no longer used here.
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const adminProfile = await createAdminClient()
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!adminProfile.data?.is_admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const env = getBillingEnvStatus();
  let adminSupabaseReadable = false;
  let currentUserReadable = false;
  let adminError: string | null = null;

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(user.id);
    if (error) {
      adminError = error.message;
    } else {
      adminSupabaseReadable = true;
      currentUserReadable = Boolean(data.user?.id);
    }
  } catch (error) {
    adminError = error instanceof Error ? error.message : "Unknown admin error";
  }

  return NextResponse.json({
    ok: true,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    supabaseHost: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
      : null,
    vars: {
      NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      PAYSTACK_SECRET_KEY: Boolean(process.env.PAYSTACK_SECRET_KEY),
      PAYSTACK_PUBLIC_KEY: Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY),
      GROQ_API_KEY: hasRealSecret("GROQ_API_KEY"),
      GROQ_MODEL: Boolean(process.env.GROQ_MODEL),
      GROQ_REASONING_MODEL: Boolean(process.env.GROQ_REASONING_MODEL),
      CEREBRAS_API_KEY: hasRealSecret("CEREBRAS_API_KEY"),
      CEREBRAS_MODEL: Boolean(process.env.CEREBRAS_MODEL),
      GEMINI_API_KEY: hasRealSecret("GEMINI_API_KEY"),
      GEMINI_MODEL: Boolean(process.env.GEMINI_MODEL),
      // Fix #7: CRON_SECRET missing = silent 401, all scheduled jobs stop silently
      CRON_SECRET: hasRealSecret("CRON_SECRET"),
      NEXT_PUBLIC_APP_URL: Boolean(process.env.NEXT_PUBLIC_APP_URL),
    },
    env,
    aiProviders: getAIProviderStatus(),
    checks: {
      adminSupabaseReadable,
      currentUserReadable,
      adminError,
    },
  });
}
