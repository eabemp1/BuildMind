/**
 * app/api/founder-context/scorecard/route.ts
 *
 * GET → returns the founder's consolidated scorecard via lib/scorecard.ts.
 *
 * This is the ONE endpoint client pages should call for momentum, streak,
 * xp, executionScore, and the composite projectScore. Replaces the pattern
 * of pages independently calling getXP()/getStoredStreak()/computeStartupScore()
 * with manually-assembled (and frequently incomplete) input objects.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getFounderScorecard } from "@/lib/scorecard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const strengthsParam = url.searchParams.get("validationStrengths");
  const validationStrengths = strengthsParam
    ? strengthsParam.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  try {
    const scorecard = await getFounderScorecard(user.id, validationStrengths);
    return NextResponse.json({ ok: true, data: scorecard });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load scorecard" },
      { status: 500 },
    );
  }
}
