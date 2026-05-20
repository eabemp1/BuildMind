/**
 * app/api/push/send-daily/route.ts
 *
 * THE REAL SENDER — called by Vercel Cron every morning.
 * Uses web-push npm package which handles all RFC 8291 encryption correctly.
 *
 * Setup:
 *   npm install web-push
 *   npm install --save-dev @types/web-push
 *
 * Add to vercel.json (at project root):
 *   {
 *     "crons": [
 *       {
 *         "path": "/api/push/send-daily",
 *         "schedule": "0 6 * * *"
 *       }
 *     ]
 *   }
 *
 * Environment variables needed (add to Vercel + .env.local):
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
 *   VAPID_PRIVATE_KEY=...
 *   VAPID_SUBJECT=mailto:hello@buildmind.live
 *   CRON_SECRET=any-random-string-you-choose
 *   SUPABASE_SERVICE_ROLE_KEY=...   (already have this)
 *
 * Generate VAPID keys (run once in terminal):
 *   npx web-push generate-vapid-keys
 *   → copy public key to NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   → copy private key to VAPID_PRIVATE_KEY
 */

import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { planFromUserMetadata } from "@/lib/plan";
import { logError, logInfo } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

let vapidConfigured = false;

function configureVapidDetails() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

// Notification templates — rotated daily to avoid fatigue
// NOTE: Recovery Mode overrides these with a personalised message (NEW IN V4)
const DAILY_MESSAGES = [
  {
    title: "⚡ BuildMind — Your action is ready",
    body: "Today's task is waiting. One action. Already decided. Open it.",
    url: "/today",
    tag: "daily-action",
  },
  {
    title: "🔥 Your momentum is building",
    body: "One action. That's all it takes. Open BuildMind and do today's task.",
    url: "/today",
    tag: "daily-action",
  },
  {
    title: "⚡ One task. That's all.",
    body: "Not a checklist. Not a plan. One specific action for your startup today.",
    url: "/today",
    tag: "daily-action",
  },
  {
    title: "🧠 What did you build yesterday?",
    body: "Reflect on yesterday. Get your action for today. 2 minutes.",
    url: "/reflect",
    tag: "daily-reflect",
  },
  {
    title: "📋 Weekly report ready",
    body: "Your intention vs action report for this week is ready. How did you do?",
    url: "/reports",
    tag: "weekly-report",
  },
];

// Recovery Mode messages — used when momentum has decayed 3+ days (NEW IN V4)
// These replace the standard daily notification with warmth instead of pressure.
const RECOVERY_MODE_MESSAGES = [
  {
    title: "BuildMind — one small thing",
    body: "I know last week was rough. Let's restart clean today — one small thing.",
    url: "/today",
    tag: "recovery-mode",
  },
  {
    title: "No pressure. One step.",
    body: "You're not falling — you're holding. That's enough for today. One task is ready.",
    url: "/today",
    tag: "recovery-mode",
  },
];

function getDailyMessage() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_MESSAGES[dayOfYear % DAILY_MESSAGES.length];
}

function getRecoveryMessage() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return RECOVERY_MODE_MESSAGES[dayOfYear % RECOVERY_MODE_MESSAGES.length];
}

function getBearerToken(req: NextRequest): string | undefined {
  const authorization = req.headers.get("authorization");
  if (!authorization) return undefined;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

const FREE_BRIEFING_DAYS = new Set([1, 3, 5]);

function isBriefingDayForPlan(plan: string): boolean {
  if (plan === "builder") return true;
  return FREE_BRIEFING_DAYS.has(new Date().getDay());
}

export async function POST(req: NextRequest) {
  const start = Date.now();

  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "CRON_SECRET is missing. Add it in Vercel Environment Variables so Vercel Cron can authenticate." },
      { status: 500 },
    );
  }

  // Accept Vercel's native cron auth (Authorization: Bearer) OR custom header
  const cronSecret =
    req.headers.get("x-cron-secret") ??
    getBearerToken(req);

  const isValidSecret = cronSecret === process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV !== "production";

  if (!isValidSecret && !isDev) {
    return NextResponse.json(
      { error: "Unauthorized", hint: "Vercel Cron must call this route with Authorization: Bearer <CRON_SECRET> or x-cron-secret." },
      { status: 401 },
    );
  }

  const envStatus = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vapidPublic: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivate: Boolean(process.env.VAPID_PRIVATE_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };

  const missing = Object.entries(envStatus)
    .filter(([, ok]) => !ok)
    .map(([key]) => key);

  if (missing.length > 0) {
    return NextResponse.json(
      { error: "Push cron is missing required environment variables.", missing, envStatus },
      { status: 500 },
    );
  }

  configureVapidDetails();

  // Admin Supabase client (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  // Early exit if no actionable records exist.
  const { count: subscriptionCount, error: subscriptionCountError } = await supabase
    .from("push_subscriptions")
    .select("user_id", { count: "exact", head: true });
  if (subscriptionCountError) {
    return NextResponse.json({ error: subscriptionCountError.message, step: "count_subscriptions" }, { status: 500 });
  }
  if (!subscriptionCount) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  // Cursor-paginated fetch — prevents OOM crash at scale (fixes audit §3 critical issue).
  const PAGE_SIZE = 100;
  const allSubs: Array<{ user_id: string; subscription: webpush.PushSubscription }> = [];
  let pageFrom = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: page, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, subscription")
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);

    if (error) {
      logError("push/send-daily/fetch", error, { route: "/api/push/send-daily" });
      return NextResponse.json({ error: error.message, step: "fetch_subscriptions" }, { status: 500 });
    }

    const rows = page ?? [];
    allSubs.push(...(rows as Array<{ user_id: string; subscription: webpush.PushSubscription }>));
    hasMore = rows.length === PAGE_SIZE;
    pageFrom += PAGE_SIZE;
  }

  const subs = allSubs;

  if (!subs || subs.length === 0) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start, sent: 0, failed: 0, total: 0, message: "No push subscribers yet" });
  }

  // Fetch founder context for Recovery Mode detection (NEW IN V4)
  const userIds = subs.map((s) => s.user_id);
  const BATCH_SIZE = 20;
  const contexts: Array<{ user_id: string; days_inactive: number; momentum_score: number; recovery_mode_active: boolean }> = [];
  const todayBriefings: Array<{ user_id: string; win: string; action: string }> = [];
  const planMap = new Map<string, string>();

  for (const userId of userIds) {
    const { data } = await supabase.auth.admin.getUserById(userId);
    planMap.set(userId, planFromUserMetadata(data.user));
  }
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchIds = userIds.slice(i, i + BATCH_SIZE);
    const contextQuery = supabase
      .from("founder_context")
      .select("user_id, days_inactive, momentum_score, recovery_mode_active");
    const { data } = await (batchIds.length === 1
      ? contextQuery.eq("user_id", batchIds[0])
      : contextQuery.in("user_id", batchIds));
    if (data?.length) contexts.push(...data);
  }

  // ── Dependency check: wait for morning briefings if they haven't generated yet ──
  // The morning-briefing cron runs at 05:00 UTC; this job runs at 07:00 UTC.
  // If the 05:00 job was slow or partially failed, some users won't have a
  // briefing row yet. We give it one retry trigger before falling back to the
  // generic template so founders always get a personalised notification.
  const today = new Date().toISOString().split("T")[0];
  const { count: briefingCount } = await supabase
    .from("morning_briefings")
    .select("id", { count: "exact", head: true })
    .gte("created_at", `${today}T00:00:00Z`);

  if (!briefingCount || briefingCount === 0) {
    // No briefings generated yet — trigger the morning briefing job and wait
    // up to 20 seconds before proceeding with whatever exists
    try {
      const briefingUrl = new URL("/api/morning-briefing", process.env.NEXT_PUBLIC_APP_URL || "https://buildmind.live");
      await fetch(briefingUrl.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.CRON_SECRET}`,
        },
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      // Non-fatal — proceed with fallback templates
    }
  }

  // Also fetch today's morning briefings so push body matches what user sees in-app
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    const batchIds = userIds.slice(i, i + BATCH_SIZE);
    const briefingQuery = supabase
      .from("morning_briefings")
      .select("user_id, win, action")
      .gte("created_at", `${today}T00:00:00Z`);
    const { data } = await (batchIds.length === 1
      ? briefingQuery.eq("user_id", batchIds[0])
      : briefingQuery.in("user_id", batchIds));
    if (data?.length) todayBriefings.push(...data);
  }

  const contextMap = new Map(
    (contexts ?? []).map((c: { user_id: string; days_inactive: number; recovery_mode_active: boolean }) => [c.user_id, c])
  );
  const briefingMap = new Map(
    (todayBriefings ?? []).map((b: { user_id: string; win: string; action: string }) => [b.user_id, b])
  );

  const defaultMessage = getDailyMessage();
  const recoveryMessage = getRecoveryMessage();

  if (dryRun) {
    const eligible = subs.filter((sub) => isBriefingDayForPlan(planMap.get(sub.user_id) ?? "free")).length;
    return NextResponse.json({
      ok: true,
      dryRun: true,
      total: subs.length,
      eligible,
      envStatus,
      message: defaultMessage.title,
      recoveryMessage: recoveryMessage.title,
      briefingsAvailable: briefingMap.size,
      processed: eligible,
      durationMs: Date.now() - start,
    });
  }

  // Send to all subscribers, using Recovery Mode message when appropriate
  // and personalised briefing body when available
  const results = await Promise.allSettled(
    subs.map(async (row) => {
      try {
        const plan = planMap.get(row.user_id) ?? "free";
        if (!isBriefingDayForPlan(plan)) {
          return { userId: row.user_id, ok: true, skipped: true, reason: "not_briefing_day" };
        }

        const ctx = contextMap.get(row.user_id);
        const briefing = briefingMap.get(row.user_id);
        // NEW IN V4: Use Recovery Mode message for founders who are 3+ days inactive
        const isInRecovery = ctx?.recovery_mode_active === true || (ctx?.days_inactive ?? 0) >= 3;

        let title: string;
        let body: string;
        let url: string;
        let tag: string;

        if (isInRecovery) {
          const rm = recoveryMessage;
          title = rm.title;
          body = rm.body;
          url = rm.url;
          tag = rm.tag;
        } else if (briefing?.action) {
          // Use today's personalised briefing if available — this is the real value
          title = "⚡ BuildMind — Your action is ready";
          body = briefing.action.slice(0, 100);
          url = "/today";
          tag = "daily-action";
        } else {
          // Fallback to rotation if briefing hasn't been generated yet
          const dm = defaultMessage;
          title = dm.title;
          body = dm.body;
          url = dm.url;
          tag = dm.tag;
        }

        const payload = JSON.stringify({
          title,
          body,
          // Must be PNG — SVG icon silently drops the notification on Android Chrome
          icon: "/logo/icon-192.png",
          badge: "/logo/icon-96.png",
          url,
          tag,
        });

        await webpush.sendNotification(row.subscription, payload);
        return { userId: row.user_id, ok: true, isInRecovery, personalised: Boolean(briefing?.action) };
      } catch (err: unknown) {
        // If subscription is expired/invalid (410 Gone), remove it
        if (err && typeof err === "object" && "statusCode" in err) {
          const statusCode = (err as { statusCode: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("user_id", row.user_id);
          }
        }
        return { userId: row.user_id, ok: false, err: String(err) };
      }
    })
  );

  const sent = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok && !(r.value as { skipped?: boolean }).skipped
  ).length;
  const skipped = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok && (r.value as { skipped?: boolean }).skipped
  ).length;
  const recoveryCount = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok && (r.value as { isInRecovery?: boolean }).isInRecovery
  ).length;
  const personalisedCount = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok && (r.value as { personalised?: boolean }).personalised
  ).length;
  const failed = results.length - sent - skipped;
  const failedDetails = results
    .filter((r) => r.status === "fulfilled" && !r.value.ok)
    .slice(0, 5)
    .map((r) => (r.status === "fulfilled" ? { userId: r.value.userId, error: r.value.err } : null))
    .filter(Boolean);

  logInfo("push/send-daily/complete", "Daily push complete", { sent, personalisedCount, recoveryCount, failed });

  // ── Log cron run for health check endpoint ────────────────────────────────
  // push_cron_log may not exist yet — log is best-effort, never blocks response
  void supabase.from("push_cron_log").insert({
    ran_at: new Date().toISOString(),
    status: failed === 0 ? "success" : sent > 0 ? "partial" : "failed",
    sent_count: sent,
    failed_count: failed,
    total_subscribers: subs.length,
  });

  return NextResponse.json({
    sent,
    skipped,
    failed,
    recoveryMode: recoveryCount,
    personalised: personalisedCount,
    total: subs.length,
    message: defaultMessage.title,
    failedDetails,
    processed: sent + skipped,
    durationMs: Date.now() - start,
  });
}

// Allow GET for Vercel cron (which always sends GET) and manual testing
export async function GET(req: NextRequest) {
  return POST(req);
}
