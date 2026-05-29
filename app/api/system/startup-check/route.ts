import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const checks = [
  { key: "NEXT_PUBLIC_SUPABASE_URL",        required: true,  label: "Supabase URL" },
  { key: "NEXT_PUBLIC_SUPABASE_ANON_KEY",   required: true,  label: "Supabase Anon Key" },
  { key: "SUPABASE_SERVICE_ROLE_KEY",       required: true,  label: "Supabase Service Role (memory/AI)" },
  { key: "GROQ_API_KEY",                    required: true,  label: "Groq API Key (AI required)" },
  { key: "CEREBRAS_API_KEY",                required: false, label: "Cerebras API Key (optional fallback)" },
  { key: "GEMINI_API_KEY",                  required: false, label: "Gemini API Key (optional fallback)" },
  { key: "RESEND_API_KEY",                  required: true,  label: "Resend Email (billing confirmations)" },
  { key: "PAYSTACK_SECRET_KEY",             required: true,  label: "Paystack Secret Key" },
  { key: "NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY", required: true,  label: "Paystack Public Key" },
  { key: "CRON_SECRET",                     required: true,  label: "Cron Secret (all cron jobs)" },
  { key: "NEXT_PUBLIC_VAPID_PUBLIC_KEY",    required: true,  label: "VAPID Public Key (push)" },
  { key: "VAPID_PRIVATE_KEY",               required: true,  label: "VAPID Private Key (push)" },
  { key: "SENTRY_DSN",                      required: false, label: "Sentry DSN (error monitoring)" },
];

function looksLikePlaceholder(value: string | undefined): boolean {
  if (!value) return false;
  const lowered = value.toLowerCase();
  return lowered.includes("your_key") ||
    lowered.includes("replace_me") ||
    lowered.includes("example");
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const adminProfile = await createAdminClient()
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminProfile.data?.is_admin) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const results = checks.map((check) => {
    const value = process.env[check.key]?.trim();
    const set = Boolean(value);
    const placeholder = looksLikePlaceholder(value);
    return {
      key: check.key,
      label: check.label,
      required: check.required,
      set,
      placeholder,
      ok: check.required ? set && !placeholder : !placeholder,
    };
  });

  const allRequiredSet = results
    .filter((check) => check.required)
    .every((check) => check.set && !check.placeholder);

  return NextResponse.json({
    ok: true,
    allRequiredSet,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    checks: results,
  });
}
