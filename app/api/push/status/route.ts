/**
 * app/api/push/status/route.ts
 *
 * GET → returns the current user's push subscription status and diagnostic info.
 * Useful for debugging why notifications aren't arriving.
 *
 * Returns:
 *   - hasSubscription: whether they have a push_subscriptions row
 *   - hasBriefingToday: whether a morning_briefing was generated today
 *   - envReady: whether VAPID keys and CRON_SECRET are set (server-side check)
 *   - lastSentAt: when the last push was sent (from scheduled_job_log)
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const admin = createAdminClient();
  const today = new Date().toISOString().split("T")[0];

  const [subResult, briefingResult, jobResult] = await Promise.allSettled([
    admin
      .from("push_subscriptions")
      .select("user_id, created_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("morning_briefings")
      .select("id, win, action, created_at")
      .eq("user_id", user.id)
      .gte("created_at", `${today}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("scheduled_job_log")
      .select("job_name, status, created_at")
      .in("job_name", ["morning_briefing", "daily_push", "send_daily"])
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const sub = subResult.status === "fulfilled" ? subResult.value.data : null;
  const briefing = briefingResult.status === "fulfilled" ? briefingResult.value.data : null;
  const jobs = jobResult.status === "fulfilled" ? (jobResult.value.data ?? []) : [];

  const envReady = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.CRON_SECRET
  );

  const issues: string[] = [];
  if (!sub) issues.push("No push subscription found. Go to Settings → Enable push notifications.");
  if (!briefing) issues.push("No morning briefing generated today yet. The cron runs at 05:00 UTC.");
  if (!envReady) issues.push("VAPID keys or CRON_SECRET missing in Vercel environment variables.");

  return NextResponse.json({
    ok: true,
    hasSubscription: Boolean(sub),
    subscribedAt: sub?.created_at ?? null,
    hasBriefingToday: Boolean(briefing),
    briefingPreview: briefing ? { action: briefing.action?.slice(0, 80) } : null,
    envReady,
    recentJobs: jobs,
    issues,
    diagnosis: issues.length === 0
      ? "Everything looks good. Notifications should be working."
      : `${issues.length} issue(s) found.`,
  });
}
