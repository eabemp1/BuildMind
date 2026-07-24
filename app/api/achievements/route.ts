/**
 * app/api/achievements/route.ts
 *
 * GET  — returns all unlocked achievements for the current user with timestamps
 * POST — unlocks one or more achievements and writes them to the DB
 *
 * Table: user_achievements (user_id, achievement_id, unlocked_at)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { getServerAchievementStats } from "@/lib/achievementStats";
import { grantXP } from "@/lib/scorecard";
import { logError } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_achievements")
      .select("achievement_id, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      ids: (data ?? []).map((r) => r.achievement_id),
      records: data ?? [], // includes unlocked_at for display
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "achievements GET failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const body = await request.json().catch(() => ({}));
    const requestedIds: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (requestedIds.length === 0) {
      return NextResponse.json({ ok: false, error: "ids array required" }, { status: 400 });
    }

    // FIX (Finding A.1, BuildMind_Feature_Debugging_Audit_2026-07-22.md):
    // the client's ids array is a claim, not a fact. Re-evaluate each
    // requested achievement's own condition() against server-derived stats
    // — never persist an id just because the client asked for it. This is
    // the only change needed to stop "unlock every achievement in one POST".
    const stats = await getServerAchievementStats(userId, userResult.plan);
    const achievementById = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

    const verifiedIds = requestedIds.filter((id) => {
      const achievement = achievementById.get(id);
      if (!achievement) return false; // unknown id — reject silently
      try {
        return achievement.condition(stats);
      } catch {
        return false;
      }
    });

    const supabase = createAdminClient();
    let xpGranted = 0;

    if (verifiedIds.length > 0) {
      // FIX (audit finding: /api/user/xp let the client choose how much XP
      // to grant, capped only at 500/call — 20 calls/hour = 10,000 XP/hour
      // indefinitely). XP is now granted HERE, server-side, tied to a real
      // newly-verified achievement unlock, using that achievement's own
      // canonical xp value from ACHIEVEMENTS — never a client-supplied
      // amount. /api/user/xp's POST handler has been correspondingly
      // disabled; see that file.
      //
      // Only grant XP for IDs that are genuinely NEW — check what's already
      // unlocked first, so a repeat POST with the same ids (e.g. a retried
      // request) never double-grants. ignoreDuplicates on the upsert below
      // already prevents duplicate ROWS, but says nothing about whether we
      // already granted XP for them on a previous call.
      const { data: alreadyUnlocked } = await supabase
        .from("user_achievements")
        .select("achievement_id")
        .eq("user_id", userId)
        .in("achievement_id", verifiedIds);

      const alreadyUnlockedSet = new Set((alreadyUnlocked ?? []).map((r) => r.achievement_id));
      const newlyUnlockedIds = verifiedIds.filter((id) => !alreadyUnlockedSet.has(id));

      const rows = verifiedIds.map((achievement_id) => ({
        user_id: userId,
        achievement_id,
        unlocked_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("user_achievements")
        .upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      for (const id of newlyUnlockedIds) {
        const achievement = achievementById.get(id);
        if (!achievement || !achievement.xp) continue;
        try {
          await grantXP(userId, achievement.xp, `achievement:${id}`);
          xpGranted += achievement.xp;
        } catch (err) {
          // Don't fail the whole request over one XP grant — the
          // achievement itself is already correctly persisted above.
          logError("achievements/grantXP", err, { userId, achievementId: id });
        }
      }
    }

    return NextResponse.json({
      ok: true,
      unlocked: verifiedIds.length,
      rejected: requestedIds.length - verifiedIds.length,
      xpGranted,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "achievements POST failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
                                   }
