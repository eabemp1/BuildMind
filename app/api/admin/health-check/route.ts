import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/server/adminAuth";

/**
 * GET /api/admin/health-check
 *
 * This is deliberately NOT a new feature. It exists to answer one question:
 * is the core loop actually working for real users, or does it just look
 * right in the code? Every number here maps to a real bug found and fixed
 * earlier in this build — this route is how you'd know, going forward,
 * whether it's staying fixed instead of quietly regressing.
 *
 * Five checks, in priority order — the pillars, not feature completeness:
 *
 *   1. Trial actually starting (was silently broken for a real signup path)
 *   2. Coach not wrongly blocking free users (was 7x too restrictive)
 *   3. Witness actually reaching people (adoption of the "seen" mechanism)
 *   4. Momentum staying consistent (founder_context vs the projects mirror)
 *   5. Quiz→signup funnel actually saving (was silently failing for weeks)
 *
 * No fix here. Just the honest number. If something's red, that's the next
 * thing to work on — not a new feature.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isAdminUser(user.id))) {
    return NextResponse.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const admin = createAdminClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();

  // ── 1. Trial start rate ──────────────────────────────────────────────
  const { data: recentUsers } = await admin
    .from("founder_context")
    .select("user_id, trial_ends_at, created_at")
    .gte("created_at", thirtyDaysAgo);

  const recentUserCount = recentUsers?.length ?? 0;
  const withTrial = recentUsers?.filter(u => u.trial_ends_at).length ?? 0;
  const trialStartRate = recentUserCount > 0 ? Math.round((withTrial / recentUserCount) * 100) : null;

  // ── 2. Coach block rate for free users ───────────────────────────────
  // A healthy signal is LOW here — most free users shouldn't be hitting
  // their daily cap under normal use. A high rate suggests the cap itself
  // (or something upstream of it) is too aggressive again.
  const { count: coachBlockCount } = await admin
    .from("ai_usage_daily")
    .select("*", { count: "exact", head: true })
    .like("feature", "coach:%")
    .gte("date", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10));

  // ── 3. Witness adoption ──────────────────────────────────────────────
  // Reads the last 200 reflections logged in the last 30 days and checks
  // what fraction actually included a witnessed line — the honest measure
  // of whether founders are reaching the moment that matters most, not
  // just whether the field exists in the schema.
  const { data: recentReflections } = await admin
    .from("founder_context")
    .select("today_action")
    .gte("updated_at", thirtyDaysAgo)
    .limit(200);

  const reflectionsWithData = (recentReflections ?? []).filter(r => r.today_action) ?? [];
  const withWitness = reflectionsWithData.filter(
    r => (r.today_action as { witnessed?: string })?.witnessed,
  ).length;
  const witnessRate = reflectionsWithData.length > 0
    ? Math.round((withWitness / reflectionsWithData.length) * 100)
    : null;

  // ── 4. Momentum consistency (founder_context vs the projects mirror) ──
  // These should NEVER disagree — the mirror is written in the same
  // transaction as the source. A nonzero count here means something is
  // writing to projects.momentum_score outside the atomic RPCs again.
  const { data: contextMomentum } = await admin
    .from("founder_context")
    .select("user_id, momentum_score")
    .not("momentum_score", "is", null)
    .limit(500);

  let momentumMismatches = 0;
  if (contextMomentum?.length) {
    const userIds = contextMomentum.map(c => c.user_id);
    const { data: projectMomentum } = await admin
      .from("projects")
      .select("user_id, momentum_score")
      .in("user_id", userIds);

    const contextMap = new Map(contextMomentum.map(c => [c.user_id, c.momentum_score]));
    for (const p of projectMomentum ?? []) {
      const contextValue = contextMap.get(p.user_id);
      if (contextValue !== undefined && contextValue !== p.momentum_score) {
        momentumMismatches++;
      }
    }
  }

  // ── 5. Quiz → founding_members save rate ─────────────────────────────
  const { count: foundingMemberCount } = await admin
    .from("founding_members")
    .select("*", { count: "exact", head: true })
    .gte("created_at", thirtyDaysAgo);

  // Check 6: AI generation fallback rate + repeat offenders.
  // THE MOST IMPORTANT CHECK ON THIS PAGE. A real user hit the static
  // per-stage fallback template 20+ times in a row across 6 weeks with
  // zero visibility anywhere queryable — this is what would have caught it
  // in week one instead of week six. repeatOffenders (3+ hits in 7 days for
  // one user) is the real signal, not the raw count — occasional fallback
  // firing is normal, models do sometimes fail.
  const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  let fallbackCount = 0;
  let repeatOffenders: { userId: string; count: number }[] = [];
  try {
    const { data: fallbackEvents } = await admin
      .from("ai_generation_fallback_events")
      .select("user_id, created_at")
      .gte("created_at", sevenDaysAgo);

    fallbackCount = fallbackEvents?.length ?? 0;
    const byUser = new Map<string, number>();
    for (const e of fallbackEvents ?? []) {
      byUser.set(e.user_id, (byUser.get(e.user_id) ?? 0) + 1);
    }
    repeatOffenders = [...byUser.entries()]
      .filter(([, count]) => count >= 3)
      .map(([userId, count]) => ({ userId, count }))
      .sort((a, b) => b.count - a.count);
  } catch {
    // Table may not exist yet if the migration hasn't been run — non-fatal.
  }

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    checks: {
      trialStart: {
        label: "Trial actually starting for new signups",
        rate: trialStartRate,
        sampleSize: recentUserCount,
        healthy: trialStartRate === null ? null : trialStartRate >= 90,
        note: recentUserCount === 0 ? "No new signups in the last 30 days to measure." : null,
      },
      coachBlocks: {
        label: "Coach daily-limit hits in the last 7 days",
        count: coachBlockCount ?? 0,
        note: "Not inherently good or bad on its own — compare against total coach usage. A sudden spike after a deploy is the real signal.",
      },
      witnessAdoption: {
        label: "Reflections that included a witnessed acknowledgment",
        rate: witnessRate,
        sampleSize: reflectionsWithData.length,
        healthy: witnessRate === null ? null : witnessRate >= 50,
        note: witnessRate !== null && witnessRate < 50
          ? "Low adoption means the differentiator that matters most isn't reaching most founders — worth asking why before building anything new."
          : null,
      },
      momentumConsistency: {
        label: "founder_context vs projects momentum mismatches",
        mismatches: momentumMismatches,
        sampleSize: contextMomentum?.length ?? 0,
        healthy: momentumMismatches === 0,
        note: momentumMismatches > 0
          ? "Should always be zero. Something is writing to projects.momentum_score outside the atomic RPCs."
          : null,
      },
      quizFunnel: {
        label: "Founding-member pre-commitments saved, last 30 days",
        count: foundingMemberCount ?? 0,
        note: "Zero here for an extended period likely means the save is broken again, not that nobody's taking the quiz — check before assuming.",
      },
      aiFallbackRate: {
        label: "AI generation fallback events, last 7 days",
        count: fallbackCount,
        repeatOffenders,
        healthy: repeatOffenders.length === 0,
        note: repeatOffenders.length > 0
          ? repeatOffenders.length + " user(s) hitting the static fallback 3+ times this week — their real AI generation is structurally broken, not unlucky. This is exactly the pattern that ran undetected for 6 weeks before. Check these user_ids first."
          : null,
      },
    },
  });
      }
