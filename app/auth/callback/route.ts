import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_DURATION_DAYS } from "@/lib/plan";
import { markFoundingEligible } from "@/lib/billing/server";
import { logError } from "@/lib/server/logger";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/onboarding";
  return value;
}

function appOrigin(requestUrl: URL): string {
  // OAuth PKCE stores the verifier against the browser origin that started the
  // sign-in. Redirecting to a different configured host after callback can make
  // mobile browsers look logged out even when the exchange succeeded.
  return requestUrl.origin.replace(/\/$/, "");
}

/**
 * maybeTagFoundingMember — honors the Founder Execution Rhythm Quiz's
 * "lifetime founder pricing + direct input on the roadmap" pre-commitment
 * promise automatically, with no manual work required.
 *
 * Runs on every sign-in (cheap no-op for everyone who never took the quiz).
 * If this user's email matches an unconverted row in founding_members:
 *   1. Flags them as founding-discount-eligible (does NOT grant free access —
 *      see markFoundingEligible for why). The discount is applied at checkout.
 *   2. Stamps founding_members.converted_user_id so this only ever fires once.
 * Best-effort — never blocks sign-in if it fails.
 */
async function maybeTagFoundingMember(supabase: Awaited<ReturnType<typeof createClient>>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const admin = createAdminClient();
    const email = user.email.trim().toLowerCase();

    const { data: match } = await admin
      .from("founding_members")
      .select("id, converted_user_id")
      .eq("email", email)
      .is("converted_user_id", null)
      .maybeSingle();

    if (!match) return; // no pre-commitment, or already converted — nothing to do

    await markFoundingEligible(user.id, email);

    await admin
      .from("founding_members")
      .update({ converted_user_id: user.id, converted_at: new Date().toISOString() })
      .eq("id", match.id);
  } catch (err) {
    logError("auth/callback/maybeTagFoundingMember", err);
    // Non-fatal — sign-in proceeds either way; can be reconciled manually if needed.
  }
}

/**
 * maybeCreditReferral — reads the bm_ref cookie (set by middleware.ts when
 * someone visits with ?ref=<code>) and records a conversion for that
 * promoter, once per user. This is the actual "did their content drive
 * signups" answer — not activity volume, a real attributed conversion.
 * Best-effort — never blocks sign-in if it fails.
 */
async function maybeCreditReferral(request: NextRequest, userId: string) {
  try {
    const refCode = request.cookies.get("bm_ref")?.value;
    if (!refCode) return;

    const admin = createAdminClient();
    const { data: promoter } = await admin
      .from("promoters")
      .select("id")
      .eq("ref_code", refCode)
      .maybeSingle();
    if (!promoter) return;

    // Unique index on user_id makes this safe to call more than once —
    // a duplicate insert just fails silently and is ignored below.
    await admin
      .from("promoter_conversions")
      .insert({ promoter_id: promoter.id, user_id: userId })
      .then(() => {}, () => {}); // ignore unique-violation on repeat visits
  } catch (err) {
    logError("auth/callback/maybeCreditReferral", err);
  }
}

async function maybeStartTrial(supabase: Awaited<ReturnType<typeof createClient>>) {
  // ── Free Trial: initialise on first sign-in ──────────────────────────────
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

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeNextPath(requestUrl.searchParams.get("next"));
  const origin = appOrigin(requestUrl);
  const providerError = requestUrl.searchParams.get("error");
  const providerErrorDescription = requestUrl.searchParams.get("error_description");

  if (providerError) {
    const redirectUrl = new URL(origin);
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("error", "oauth_provider_failed");
    redirectUrl.searchParams.set("reason", providerErrorDescription || providerError);
    return NextResponse.redirect(redirectUrl);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await maybeStartTrial(supabase);
        await maybeTagFoundingMember(supabase);
        await maybeCreditReferral(request, user.id);
        const redirectUrl = new URL(origin);
        redirectUrl.pathname = next;
        return NextResponse.redirect(redirectUrl);
      }

      const redirectUrl = new URL(origin);
      redirectUrl.pathname = "/auth/login";
      redirectUrl.searchParams.set("error", "auth_callback_failed");
      redirectUrl.searchParams.set("reason", error.message);
      return NextResponse.redirect(redirectUrl);
    }

    await maybeStartTrial(supabase);
    await maybeTagFoundingMember(supabase);
    {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await maybeCreditReferral(request, user.id);
    }
  } else {
    const supabase = await createClient();
    await maybeStartTrial(supabase);
    await maybeTagFoundingMember(supabase);
    {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await maybeCreditReferral(request, user.id);
    }
  }

  const redirectUrl = new URL(origin);
  redirectUrl.pathname = next;
  return NextResponse.redirect(redirectUrl);
}
