import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/founder/detect-country
 *
 * Silently captures the founder's country from Vercel's IP geolocation
 * header into founder_context — reusing the exact same signal already used
 * for billing currency detection (app/api/billing/checkout/route.ts), so no
 * new onboarding question or user-facing step is added.
 *
 * First-write-wins: if a value already exists, this is a no-op — so a user
 * who manually corrects their country later (e.g. via a settings field, if
 * you add one) never gets silently overwritten by IP geo again.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const country = req.headers.get("x-vercel-ip-country")?.trim().toUpperCase();
    if (!country) return NextResponse.json({ ok: true, skipped: "no_geo_header" });

    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("founder_context")
      .select("country")
      .eq("user_id", user.id)
      .maybeSingle();

    if (existing?.country) {
      return NextResponse.json({ ok: true, skipped: "already_set" });
    }

    await admin
      .from("founder_context")
      .upsert(
        { user_id: user.id, country, country_source: "ip" },
        { onConflict: "user_id", ignoreDuplicates: false },
      );

    return NextResponse.json({ ok: true, country });
  } catch {
    // Non-fatal — country context is an enhancement, never a blocker.
    return NextResponse.json({ ok: false });
  }
}
