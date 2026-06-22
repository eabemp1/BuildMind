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

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const [metrics, weekSummary] = await Promise.all([
    getPulseMetrics(user.id),
    getPulseWeekSummary(user.id),
  ]);

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
    },
  });
}
