/**
 * app/api/founder-context/scorecard/route.ts
 *
 * GET → returns the founder's consolidated scorecard via lib/scorecard.ts.
 *
 * This is the ONE endpoint client pages should call for momentum, streak,
 * xp, and executionScore. Replaces the pattern of pages independently
 * calling getXP()/getStoredStreak()/computeStartupScore() with
 * manually-assembled (and frequently incomplete) input objects.
 *
 * No longer returns a composite `projectScore` — that field used to be
 * computed here from a founder-wide "most recently updated project" proxy,
 * documented as used by dashboard/reports/weekly-share but actually read
 * by none of them; every real consumer computes its own score from the
 * SPECIFIC project it's displaying, using this scorecard's xp/streak plus
 * that project's own execution_score/momentum_score. See lib/scorecard.ts's
 * FIX comment for the full reasoning.
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
