/**
 * app/api/evening-checkin/route.ts — Product Improvement #8
 *
 * Receives the founder's end-of-day reflection (one honest sentence).
 * Stores it in recent_interactions for AI Coach context and weekly report generation.
 * Used by the MobileCheckin component on /today (evening time window: 6–10pm).
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

    // Store in recent_interactions — AI Coach uses last 3 for cross-session continuity
    const interaction = {
      type:       "evening_checkin",
      note,
      timestamp:  now,
    };

    const { data: existing } = await admin
      .from("founder_context")
      .select("recent_interactions")
      .eq("user_id", user.id)
      .maybeSingle();

    const current: unknown[] = Array.isArray(existing?.recent_interactions) ? existing.recent_interactions : [];
    const updated = [interaction, ...current].slice(0, 10);

    await admin.from("founder_context").upsert({
      user_id:             user.id,
      recent_interactions: updated,
      updated_at:          now,
    }, { onConflict: "user_id" });

    // Also trigger the evening-check cron worker asynchronously for re-engagement scoring
    // Best-effort — failure doesn't affect the check-in UX
    fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/cron/evening-check/worker`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      body: JSON.stringify({ userId: user.id }),
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[evening-checkin]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
