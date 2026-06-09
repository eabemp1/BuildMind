/**
 * GET /api/behavioral/mirror
 *
 * Returns the Mirror Moment data for the authenticated founder:
 *   - Their current milestone (first_insight / signature_card / pattern_report / null)
 *   - Their archetype
 *   - First insight (if at 3+ check-ins)
 *   - Signature card (if at 7+ days)
 *   - Pattern report (if at 30+ days)
 *   - Social share card
 *
 * Called from:
 *   - /overview page (to show the archetype badge)
 *   - /progress page (to show the signature card)
 *   - /weekly-share page (to render the behavioral share card)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { loadBehavioralContext } from "@/lib/behavioralLayers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { userId } = routeUser;

    if (!hasAdminEnv()) {
      return NextResponse.json({
        success: true,
        data: {
          milestone: null,
          archetype: null,
          firstInsight: null,
          signatureCard: null,
          patternReport: null,
          shareCard: null,
        },
      });
    }

    const supabase = createAdminClient();

    // Fetch founder name for share cards
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, display_name")
      .eq("id", userId)
      .maybeSingle();

    const founderName =
      (profile as { full_name?: string; display_name?: string } | null)?.display_name ??
      (profile as { full_name?: string; display_name?: string } | null)?.full_name ??
      null;

    // Load all behavioral layers
    const ctx = await loadBehavioralContext(supabase, userId, 50, founderName, null);

    return NextResponse.json({
      success: true,
      data: {
        milestone: ctx.milestone,
        archetype: ctx.archetype,
        firstInsight: ctx.firstInsight,
        signatureCard: ctx.signatureCard,
        patternReport: ctx.patternReport,
        shareCard: ctx.shareCard,
        checkinsTotal: ctx.checkinsTotal,
        daysSinceStart: ctx.daysSinceStart,
        // Temporal summary for overview page
        peakProductivityHour: ctx.temporal.peakProductivityHour,
        sessionLengthTrend: ctx.temporal.sessionLengthTrend,
        streakFragility: ctx.temporal.streakFragility,
        // Execution summary
        strengths: ctx.execution.strengths,
        avoidanceZones: ctx.execution.avoidanceZones,
        signatureSentence: ctx.execution.signatureSentence,
        recommendationMode: ctx.execution.recommendationMode,
        // External anchor alerts
        anchorAlerts: ctx.anchors.alerts.slice(0, 3),
        daysSinceUserConversation: ctx.anchors.daysSinceUserConversation,
        // Top linguistic signals
        linguisticSignals: ctx.linguistic.signals.slice(0, 2),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mirror moment failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
