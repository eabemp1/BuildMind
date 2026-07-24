/**
 * app/api/user/xp/route.ts
 *
 * GET  → returns the current user's XP total from founder_context
 * POST → disabled (410 Gone). XP grants now happen server-side only,
 *         inside POST /api/achievements, tied to verified achievement
 *         unlocks. See that route.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderScorecard } from "@/lib/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const scorecard = await getFounderScorecard(userId);
    return NextResponse.json({ xp: scorecard.xp });
  } catch {
    return NextResponse.json({ xp: 0 });
  }
}

export async function POST() {
  // FIX (security audit, high-severity): this endpoint previously accepted
  // a client-supplied { amount, reason } and trusted it directly, capped
  // only at 500/request — 20 requests/hour (the route's own rate limit)
  // meant a script could grant up to 10,000 XP/hour indefinitely, with no
  // check that any real, verifiable event actually happened.
  //
  // XP is now granted exclusively server-side, inside POST /api/achievements,
  // tied to a real newly-verified achievement unlock and using that
  // achievement's own canonical xp value — never a client-supplied amount.
  // This endpoint's only remaining legitimate caller (lib/achievements.ts)
  // has been updated to stop calling it. Kept as a route (rather than
  // deleted) so any stale client / old cached JS bundle that still tries to
  // call it fails loudly and safely instead of 404ing unexpectedly.
  return NextResponse.json(
    { error: "Direct XP grants are no longer accepted. XP is awarded automatically via verified achievement unlocks." },
    { status: 410 }, // 410 Gone — deliberate, not a transient failure
  );
}
