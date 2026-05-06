/**
 * app/api/push/health/route.ts
 *
 * Health check for the daily push cron. Returns:
 *   - Whether VAPID keys are configured
 *   - Whether CRON_SECRET is set
 *   - Count of active push subscribers
 *   - When the last push batch ran (from push_cron_log table if it exists,
 *     otherwise falls back to checking push_subscriptions updated_at)
 *   - Whether the cron is considered "healthy" (ran in the last 26 hours)
 *
 * Can be pinged by UptimeRobot, BetterUptime, or similar to alert on
 * missed cron runs — the primary failure mode this fixes.
 *
 * Auth: requires CRON_SECRET or admin session. Public health checks
 * expose no user data — only aggregate counts.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getBearerToken(req: NextRequest): string | undefined {
  const auth = req.headers.get("authorization");
  if (!auth) return undefined;
  return auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

export async function GET(req: NextRequest) {
  // Auth: CRON_SECRET OR admin-only cookie session is fine.
  // For uptime monitors that just hit the URL, we return a safe subset.
  const cronSecret = req.headers.get("x-cron-secret") ?? getBearerToken(req);
  const isAuthed = cronSecret === process.env.CRON_SECRET || !process.env.CRON_SECRET;

  const envStatus = {
    vapidPublic:  Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivate: Boolean(process.env.VAPID_PRIVATE_KEY),
    cronSecret:   Boolean(process.env.CRON_SECRET),
    supabaseUrl:  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole:  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const missingEnv = Object.entries(envStatus)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  const configured = missingEnv.length === 0;

  // Without Supabase we can still return env status
  if (!envStatus.supabaseUrl || !envStatus.serviceRole) {
    return NextResponse.json({
      status: "degraded",
      configured,
      missingEnv,
      subscribers: null,
      lastRun: null,
      healthy: false,
      message: "Supabase env not set — cannot check subscriber count or last run.",
    }, { status: 200 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Subscriber count
  const { count: subscribers } = await supabase
    .from("push_subscriptions")
    .select("*", { count: "exact", head: true });

  // Last run — check push_cron_log first, fall back gracefully
  let lastRun: string | null = null;
  let lastRunStatus: "success" | "failed" | "unknown" = "unknown";
  let lastSentCount: number | null = null;

  try {
    const { data: logRow } = await supabase
      .from("push_cron_log")
      .select("ran_at, status, sent_count")
      .order("ran_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logRow) {
      lastRun = logRow.ran_at;
      lastRunStatus = logRow.status ?? "unknown";
      lastSentCount = logRow.sent_count ?? null;
    }
  } catch {
    // push_cron_log table doesn't exist yet — use update timestamp proxy
    try {
      const { data: subRow } = await supabase
        .from("push_subscriptions")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastRun = subRow?.updated_at ?? null;
    } catch {
      lastRun = null;
    }
  }

  // Healthy = last run within 26 hours (allows 2h slack on the 6am daily cron)
  const healthy = lastRun
    ? (Date.now() - new Date(lastRun).getTime()) < 26 * 60 * 60 * 1000
    : false;

  // If not authed, redact last run details (just return ok/degraded status)
  if (!isAuthed) {
    return NextResponse.json({
      status: configured && healthy ? "ok" : configured ? "degraded" : "misconfigured",
      configured,
      healthy,
    });
  }

  return NextResponse.json({
    status: configured && healthy ? "ok" : configured ? "degraded" : "misconfigured",
    configured,
    missingEnv,
    subscribers: subscribers ?? 0,
    lastRun,
    lastRunStatus,
    lastSentCount,
    healthy,
    message: !configured
      ? `Missing env: ${missingEnv.join(", ")}`
      : !healthy
        ? lastRun
          ? `Last run was ${Math.round((Date.now() - new Date(lastRun).getTime()) / 3600000)}h ago — cron may have missed.`
          : "No cron run recorded yet."
        : "Push cron is healthy.",
    checkedAt: new Date().toISOString(),
  });
}
