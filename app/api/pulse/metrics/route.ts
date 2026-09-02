/**
 * app/api/pulse/metrics/route.ts
 *
 * GET → returns the authenticated founder's current Pulse metrics.
 *
 * Used by:
 *   - /weekly-share page (replaces direct founder_context momentum_score read)
 *   - Today page (future: Pulse Score ring display)
 *   - Progress page (replaces score_history reads)
 *
 * Response shape:
 * {
 *   ok: true,
 *   data: {
 *     pulseScore:    number,   // 0–100 canonical execution quality
 *     pulseStreak:   number,   // consecutive days with positive-weight events
 *     velocity7d:    number,   // avg daily Pulse Score over last 7 days
 *     signalRatio:   number,   // 0–1, positive weight / total weight (last 14d)
 *     peakEventType: string | null,
 *     eventsCount:   number,
 *     executionTrend: "up" | "down" | "flat",
 *   }
 * }
 *
 * Falls back gracefully when pulse_events has no data yet (new users) —
 * returns zeroed metrics rather than erroring so the UI degrades cleanly.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPulseMetrics, getPulseWeekSummary } from "@/lib/pulse";
import { loadFounderIntelligence, summarizeFounderIntelligenceForClient } from "@/lib/founderIntelligence";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const [metrics, weekSummary] = await Promise.all([
    getPulseMetrics(user.id),
    getPulseWeekSummary(user.id),
  ]);
  const projectId = new URL(request.url).searchParams.get("projectId") || undefined;
  // Pulse is a consumer of the existing intelligence read model. It does not
  // derive a second slippage interpretation from pulse score data.
  let intelligence: ReturnType<typeof summarizeFounderIntelligenceForClient> | undefined;
  if (projectId) {
    // Prefer the exact intelligence payload that produced Today's shown
    // recommendation. This preserves the same signal/recommendation IDs for
    // Pulse instead of rendering a second request-time interpretation.
    const { data: cacheRow } = await supabase
      .from("user_behavior_state")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", "today_action_cache")
      .maybeSingle();
    const cached = cacheRow?.value as { date?: string; projectId?: string; data?: { intelligence?: ReturnType<typeof summarizeFounderIntelligenceForClient> } } | null;
    const today = new Date().toISOString().slice(0, 10);
    intelligence = cached?.date === today && cached.projectId === projectId
      ? cached.data?.intelligence
      : await loadFounderIntelligence(supabase, user.id, projectId).then(summarizeFounderIntelligenceForClient).catch(() => undefined);
  }

  return NextResponse.json({
    ok: true,
    data: {
      pulseScore:     metrics.pulseScore,
      pulseStreak:    metrics.pulseStreak,
      velocity7d:     metrics.velocity7d,
      signalRatio:    metrics.signalRatio,
      peakEventType:  metrics.peakEventType,
      eventsCount:    metrics.eventsCount,
      executionTrend: weekSummary.executionTrend,
      positiveEvents: weekSummary.positiveEvents,
      negativeEvents: weekSummary.negativeEvents,
      stageAdvances:  weekSummary.stageAdvances,
      avgReflectionQuality:
        weekSummary.reflectionQualities.length > 0
          ? Math.round(
              weekSummary.reflectionQualities.reduce((a, b) => a + b, 0) /
              weekSummary.reflectionQualities.length * 10
            ) / 10
          : null,
      intelligence,
    },
  });
}
