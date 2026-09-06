/**
 * app/api/founder-context/standing/route.ts
 *
 * GET → the founder's standing: real stage readiness (via
 * getProjectReadiness, same computation the stage-transition banner
 * already uses) plus engagement (activity recency), combined by
 * getFounderStanding(). This is what CofounderPulse, Execution, and
 * Projects-list's badge should all read instead of each computing their
 * own version — see lib/server/founderStanding.ts's header for why that
 * mattered.
 *
 * Mostly read-only. Unlike evaluateAndCacheStageTransition (which this
 * shares its fetch with via getProjectReadiness), this route never writes
 * founder_context.pending_stage_transition — it's meant to be polled far
 * more often than a stage-transition check should ever be cached, so it
 * has to stay side-effect-free for anything stateful.
 *
 * One deliberate, narrow exception: logStandingSnapshot() below, an
 * idempotent daily upsert (see its own header in projectReadiness.ts for
 * why that's safe to call on every request rather than a real "state
 * changed" hazard). Fired with `void` — never awaited, never allowed to
 * affect the response the founder is waiting on. If it fails, the
 * founder still gets their standing; only the trend history for today
 * is missing, and tomorrow's write isn't affected by today's failure.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProjectReadiness, logStandingSnapshot, getStandingTrend } from "@/lib/server/projectReadiness";
import { getFounderStanding } from "@/lib/server/founderStanding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  let projectId = url.searchParams.get("projectId") || "";

  const admin = createAdminClient();
  if (!projectId) {
    // Same "most recently updated project" fallback getFounderScorecard
    // uses for its founder-wide proxy — fine here for the same reason:
    // most founders are single-project (free tier caps at 1), and a
    // multi-project founder viewing a specific page should pass
    // ?projectId= explicitly rather than relying on this default.
    const { data: project } = await admin
      .from("projects")
      .select("id")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    projectId = project?.id ?? "";
  }

  if (!projectId) {
    return NextResponse.json({ ok: false, error: "No project found" }, { status: 404 });
  }

  try {
    const result = await getProjectReadiness(user.id, projectId);
    if (!result) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }
    const standing = getFounderStanding(result.readiness, result.daysInactive);

    // Fire-and-forget, deliberately not awaited — see header comment.
    void logStandingSnapshot(user.id, projectId, standing).catch(() => {});

    // Trend is opt-in (?trend=true), same pattern as the ai-provider-status
    // route's ?live= flag — most callers (the mascot's pulse refresh) only
    // need the current point, not 14 days of history on every poll.
    const wantsTrend = url.searchParams.get("trend") === "true";
    const trend = wantsTrend ? await getStandingTrend(projectId, 14) : null;

    return NextResponse.json({ ok: true, data: { ...standing, projectId, trend } });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to load standing" },
      { status: 500 },
    );
  }
}
