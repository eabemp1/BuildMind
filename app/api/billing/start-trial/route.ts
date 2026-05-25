/**
 * app/api/billing/start-trial/route.ts
 *
 * POST — called once at signup to initialise the free trial.
 * Sets trial_started_at and trial_ends_at in founder_context so the
 * server is the authoritative source of trial state.
 *
 * Idempotent — safe to call multiple times; only acts if trial not yet set.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { TRIAL_DURATION_DAYS } from "@/lib/plan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  // F1/A1 FIX: Server always generates the trial start timestamp.
  // The client-supplied body value is intentionally ignored — accepting a
  // caller-controlled timestamp would allow permanent free-plan exploits.
  // Consume and discard the request body so the connection closes cleanly.
  await req.json().catch(() => {});
  const trialStartedAt: string = new Date().toISOString();

  const trialEndsAt = new Date(
    new Date(trialStartedAt).getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const admin = createAdminClient();

  // Check if trial already set — never overwrite an existing trial
  const { data: existing } = await admin
    .from("founder_context")
    .select("trial_started_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing?.trial_started_at) {
    // Already initialised — idempotent success
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { error: upsertError } = await admin
    .from("founder_context")
    .upsert(
      {
        user_id: user.id,
        trial_started_at: trialStartedAt,
        trial_ends_at: trialEndsAt,
        trial_expired: false,
      },
      { onConflict: "user_id" },
    );

  if (upsertError) {
    console.error("[start-trial] upsert error:", upsertError.message);
    return NextResponse.json({ ok: false, error: upsertError.message }, { status: 500 });
  }

  // Also stamp user_metadata so client-side can read it from the auth session
  await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...((user.user_metadata as Record<string, unknown>) ?? {}),
      trial_started_at: trialStartedAt,
      trial_ends_at: trialEndsAt,
    },
  });

  return NextResponse.json({ ok: true, trialEndsAt });
}
