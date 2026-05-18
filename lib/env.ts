/**
 * lib/env.ts — Environment variable validation
 *
 * Validates required environment variables at startup and provides typed
 * accessors. Throws clearly on missing required vars in production so
 * misconfigurations surface immediately rather than causing cryptic
 * runtime failures deep in the request lifecycle.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const url = env.SUPABASE_URL; // always a string in production
 *
 * Rules:
 *   - REQUIRED vars throw in production if absent
 *   - OPTIONAL vars return undefined; callers must handle that
 *   - Never import this from client-side code (server-only)
 *
 * @server-only
 */

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        `[env] Required environment variable "${name}" is not set. ` +
        `Check your Vercel project settings or .env.local file.`
      );
    }
    // In development: warn but don't throw — allows partial local setups
    console.warn(`[env] Warning: "${name}" is not set. Some features may not work.`);
    return "";
  }
  return value;
}

function optional(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

function optionalBool(name: string, defaultValue = false): boolean {
  const val = process.env[name]?.trim().toLowerCase();
  if (!val) return defaultValue;
  return val === "true" || val === "1" || val === "yes";
}

function optionalInt(name: string, defaultValue: number): number {
  const val = process.env[name]?.trim();
  if (!val) return defaultValue;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ── Validated env object ───────────────────────────────────────────────────────

export const env = {
  // ── Supabase (required) ────────────────────────────────────────────────────
  SUPABASE_URL:              required("NEXT_PUBLIC_SUPABASE_URL"),
  SUPABASE_ANON_KEY:         required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: required("SUPABASE_SERVICE_ROLE_KEY"),

  // ── AI providers ──────────────────────────────────────────────────────────
  // Groq is required; Cerebras and Gemini are optional fallbacks
  GROQ_API_KEY:              required("GROQ_API_KEY"),
  GROQ_MODEL:                process.env.GROQ_MODEL?.trim() || "openai/gpt-oss-120b",
  GROQ_REASONING_MODEL:      process.env.GROQ_REASONING_MODEL?.trim() || "openai/gpt-oss-120b",
  CEREBRAS_API_KEY:          optional("CEREBRAS_API_KEY"),
  CEREBRAS_MODEL:            process.env.CEREBRAS_MODEL?.trim() || "gpt-oss-120b",
  GEMINI_API_KEY:            optional("GEMINI_API_KEY"),
  GEMINI_MODEL:              process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",

  // ── Billing (required for paid features) ──────────────────────────────────
  PAYSTACK_SECRET_KEY:       optional("PAYSTACK_SECRET_KEY"),
  PAYSTACK_BUILDER_PLAN_CODE: optional("PAYSTACK_BUILDER_PLAN_CODE"),
  PAYSTACK_WEBHOOK_SECRET:   optional("PAYSTACK_WEBHOOK_SECRET"),
  PAYSTACK_AMOUNT_BUILDER:   optionalInt("PAYSTACK_AMOUNT_BUILDER", 44500),

  // ── Email (optional — skipped when absent, logged) ────────────────────────
  RESEND_API_KEY:            optional("RESEND_API_KEY"),
  EMAIL_FROM:                process.env.EMAIL_FROM?.trim() || "BuildMind <hello@buildmind.live>",

  // ── Cron security ─────────────────────────────────────────────────────────
  CRON_SECRET:               optional("CRON_SECRET"),

  // ── Observability (optional) ──────────────────────────────────────────────
  SENTRY_DSN:                optional("SENTRY_DSN"),

  // ── Push notifications ────────────────────────────────────────────────────
  VAPID_PUBLIC_KEY:          optional("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
  VAPID_PRIVATE_KEY:         optional("VAPID_PRIVATE_KEY"),
  VAPID_SUBJECT:             process.env.VAPID_SUBJECT?.trim() || "mailto:hello@buildmind.live",

  // ── Retention config ──────────────────────────────────────────────────────
  REENGAGEMENT_INACTIVE_DAYS: optionalInt("REENGAGEMENT_INACTIVE_DAYS", 7),

  // ── App metadata ──────────────────────────────────────────────────────────
  NODE_ENV: process.env.NODE_ENV || "development",
  APP_URL:  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://buildmind.live",

  // ── Helpers ───────────────────────────────────────────────────────────────
  isProd:  process.env.NODE_ENV === "production",
  isDev:   process.env.NODE_ENV === "development",
  isTest:  process.env.NODE_ENV === "test",
} as const;

/**
 * validateEnv — call once at startup (e.g. in instrumentation.ts) to surface
 * misconfigurations immediately rather than at first request.
 *
 * In Next.js, add this to instrumentation.ts:
 *   export async function register() {
 *     const { validateEnv } = await import("@/lib/env");
 *     validateEnv();
 *   }
 */
export function validateEnv(): void {
  // Accessing env properties triggers required() validation above.
  // This function simply forces evaluation at startup.
  const checks = [
    env.SUPABASE_URL,
    env.SUPABASE_ANON_KEY,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.GROQ_API_KEY,
  ];

  const missing = checks.filter(v => !v);
  if (missing.length > 0 && env.isProd) {
    throw new Error(
      `[env] ${missing.length} required environment variable(s) are not set. ` +
      `App cannot start. Check Vercel project settings.`
    );
  }

  if (env.isDev) {
    const warnings: string[] = [];
    if (!env.PAYSTACK_SECRET_KEY)    warnings.push("PAYSTACK_SECRET_KEY (billing disabled)");
    if (!env.PAYSTACK_WEBHOOK_SECRET) warnings.push("PAYSTACK_WEBHOOK_SECRET (webhook validation uses PAYSTACK_SECRET_KEY fallback — set a distinct webhook secret for key rotation safety)");
    if (!env.RESEND_API_KEY)         warnings.push("RESEND_API_KEY (emails will be skipped)");
    if (!env.CRON_SECRET)            warnings.push("CRON_SECRET (cron endpoints unprotected in dev)");
    if (!env.CEREBRAS_API_KEY)       warnings.push("CEREBRAS_API_KEY (Cerebras fallback disabled)");
    if (warnings.length > 0) {
      console.info(
        `[env] Optional vars not set (dev-only warning):\n` +
        warnings.map(w => `  • ${w}`).join("\n")
      );
    }
  }
}
