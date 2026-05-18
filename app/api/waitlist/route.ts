import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";

/**
 * POST /api/waitlist
 *
 * Stores a ConsentLedger waitlist signup.
 * Called by ConsentLedgerCTA component when a user submits their email.
 *
 * Supabase table needed:
 *   CREATE TABLE waitlist (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     email text NOT NULL,
 *     source text,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE UNIQUE INDEX ON waitlist (email);
 *
 * The component silently swallows errors if this route returns 404,
 * so it's safe to deploy before the table exists.
 */

export async function POST(request: Request) {
  try {
    const limit = await rateLimitAsync(`waitlist:${getClientIp(request)}`, 10, 60 * 60 * 1000, { failClosed: true });
    if (!limit.ok) {
      return NextResponse.json({ success: false, error: "Too many signup attempts. Try again later." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const email  = String(body?.email  ?? "").trim().toLowerCase();
    const source = String(body?.source ?? "buildmind").trim();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "Invalid email" }, { status: 400 });
    }

    // Only attempt Supabase write if admin env is set
    const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      const supabase = createAdminClient();
      const { error } = await supabase
        .from("waitlist")
        .upsert({ email, source }, { onConflict: "email", ignoreDuplicates: true });

      if (error && !error.message.includes("duplicate")) {
        console.error("[waitlist] Supabase error:", error.message);
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[waitlist] Unexpected error:", err);
    return NextResponse.json({ success: false, error: "Server error" }, { status: 500 });
  }
}
