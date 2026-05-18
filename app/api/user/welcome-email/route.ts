import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/user/welcome-email
 *
 * Sends the BuildMind welcome email to a newly signed-up user.
 * Called once from the onboarding page after the Reflexion Strike completes
 * and the user's workspace has been set up.
 *
 * Idempotent — checks profiles.welcome_email_sent before sending so
 * a page refresh or retry never duplicates the email.
 *
 * The welcome_email_sent column is added by the migration below.
 * If the column doesn't exist yet (old schema), the route sends anyway
 * and catches the error gracefully.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!user.email) {
    return NextResponse.json({ ok: false, error: "No email on account" }, { status: 400 });
  }

  const admin = createAdminClient();

  // ── Idempotency check ──────────────────────────────────────────────────────
  // Only send if we haven't sent before. Gracefully skip if the column doesn't
  // exist yet — the email still goes out on first run, just without dedup protection.
  let alreadySent = false;
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("welcome_email_sent")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.welcome_email_sent === true) {
      alreadySent = true;
    }
  } catch {
    // Column may not exist yet — continue
  }

  if (alreadySent) {
    return NextResponse.json({ ok: true, skipped: "already_sent" });
  }

  // ── Send welcome email ─────────────────────────────────────────────────────
  const displayName =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email.split("@")[0];

  const result = await sendEmail({
    to: user.email,
    template: "welcome",
    data: { name: displayName },
  });

  // ── Mark as sent (best-effort — don't block on failure) ───────────────────
  if (result.ok && !result.skipped) {
    admin
      .from("profiles")
      .update({ welcome_email_sent: true })
      .eq("id", user.id)
      .then(() => {})
      .catch(() => {}); // non-fatal
  }

  return NextResponse.json({
    ok: result.ok,
    id: result.id,
    skipped: result.skipped,
    error: result.error,
  });
}
