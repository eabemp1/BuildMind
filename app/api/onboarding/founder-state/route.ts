/**
 * app/api/onboarding/founder-state/route.ts
 *
 * Was missing entirely — app/onboarding/page.tsx:1752 has called this route
 * for founder worries since the "Founder State" onboarding screen (WORRY_CHIPS,
 * see app/onboarding/page.tsx) was added, but with no route.ts here the fetch
 * 404s. It's called fire-and-forget (`.catch(() => {})`, no response handling),
 * so the 404 was silent — the worries the founder picked were simply dropped.
 *
 * Persists selected worry chips into founder_memory.avoidance_zones, the same
 * table/column the sibling depth-answers route (app/api/onboarding/depth-answers/
 * route.ts) already uses for its free-text "avoidance" answer — worries picked
 * here are the same kind of signal, just chip-selected instead of typed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  // Not hard-coded to the current WORRY_CHIPS list on purpose — that list can
  // change without needing to touch this route, so long as entries stay
  // short chip-style strings rather than long free text (which already has
  // its own field: depth-answers' `avoidance`).
  worries: z.array(z.string().min(1).max(80)).max(20),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "Invalid payload" }, { status: 400 });
    }
    const { worries } = parsed.data;
    if (worries.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("founder_memory")
      .select("avoidance_zones")
      .eq("user_id", user.id)
      .maybeSingle();

    const currentAvoidance: string[] = existing?.avoidance_zones ?? [];
    // De-dupe against what's already there — same pattern as depth-answers,
    // so re-running onboarding (or a retried fire-and-forget call) can't
    // pile up duplicate entries.
    const newEntries = worries
      .map((w) => w.trim().slice(0, 100))
      .filter((w) => w.length > 0 && !currentAvoidance.includes(w));

    if (newEntries.length > 0) {
      await admin.from("founder_memory").upsert(
        {
          user_id: user.id,
          avoidance_zones: [...currentAvoidance, ...newEntries],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[founder-state]", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
