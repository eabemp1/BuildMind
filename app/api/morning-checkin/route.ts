/**
 * app/api/morning-checkin/route.ts — Product Improvement #8
 *
 * Receives the founder's morning intention (one sentence).
 * Stores it in recent_interactions so the AI Coach has context for the day.
 * Also records a benchmark event for the data moat.
 *
 * Called fire-and-forget from MobileCheckin on /today.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  note: z.string().min(1).max(400).trim(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid input" }, { status: 422 });

    const { note } = parsed.data;
    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Store in recent_interactions for cross-session continuity (AI Coach uses this)
    const interaction = {
      type:       "morning_checkin",
      note,
      timestamp:  now,
    };

    const { data: existing } = await admin
      .from("founder_context")
      .select("recent_interactions")
      .eq("user_id", user.id)
      .maybeSingle();

    const current: unknown[] = Array.isArray(existing?.recent_interactions) ? existing.recent_interactions : [];
    // Keep last 10 interactions; prepend morning check-in
    const updated = [interaction, ...current].slice(0, 10);

    await admin.from("founder_context").upsert({
      user_id:             user.id,
      recent_interactions: updated,
      updated_at:          now,
    }, { onConflict: "user_id" });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[morning-checkin]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
