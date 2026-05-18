import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_DURATION_DAYS } from "@/lib/plan";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL(requestUrl.origin);
      redirectUrl.pathname = "/auth/login";
      redirectUrl.searchParams.set("error", "auth_callback_failed");
      return NextResponse.redirect(redirectUrl);
    }

    // ── 7-Day Free Trial: initialise on first sign-in ────────────────────────
    // Only starts the trial if it hasn't been started yet (idempotent).
    // We use the admin client so this works for both OAuth and email signups.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && !user.user_metadata?.billing_status) {
        // Only start trial for users who have never paid (no billing_status set)
        const admin = createAdminClient();
        const { data: existing } = await admin
          .from("founder_context")
          .select("trial_started_at")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!existing?.trial_started_at) {
          const now = new Date();
          const trialStartedAt = now.toISOString();
          const trialEndsAt = new Date(
            now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString();

          // Persist to founder_context
          await admin.from("founder_context").upsert(
            {
              user_id: user.id,
              trial_started_at: trialStartedAt,
              trial_ends_at: trialEndsAt,
              trial_expired: false,
            },
            { onConflict: "user_id" },
          );

          // Stamp user_metadata so auth session reflects trial
          await admin.auth.admin.updateUserById(user.id, {
            user_metadata: {
              ...((user.user_metadata as Record<string, unknown>) ?? {}),
              trial_started_at: trialStartedAt,
              trial_ends_at: trialEndsAt,
            },
          });
        }
      }
    } catch {
      // Non-fatal — trial can be started lazily via /api/billing/start-trial
    }
  }

  const redirectUrl = new URL(requestUrl.origin);
  redirectUrl.pathname = next;
  return NextResponse.redirect(redirectUrl);
}
