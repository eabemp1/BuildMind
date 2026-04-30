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

// Configure VAPID (do this once at module level)
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  process.env.VAPID_PRIVATE_KEY || ""
);

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

export async function POST(req: NextRequest) {
  // Verify this is called by cron or Supabase edge function
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin Supabase client (bypasses RLS)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch all push subscriptions with founder context for Recovery Mode check
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (error) {
    console.error("[Daily Push] Fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    return NextResponse.json({ sent: 0, message: "No subscribers yet" });
  }

  // Fetch founder context for Recovery Mode detection (NEW IN V4)
  const userIds = subs.map((s) => s.user_id);
  const { data: contexts } = await supabase
    .from("founder_context")
    .select("user_id, days_inactive, momentum_score, recovery_mode_active")
    .in("user_id", userIds);

  const contextMap = new Map(
    (contexts ?? []).map((c: { user_id: string; days_inactive: number; recovery_mode_active: boolean }) => [c.user_id, c])
  );

  const defaultMessage = getDailyMessage();
  const recoveryMessage = getRecoveryMessage();

  // Send to all subscribers, using Recovery Mode message when appropriate
  const results = await Promise.allSettled(
    subs.map(async (row) => {
      try {
        const ctx = contextMap.get(row.user_id);
        // NEW IN V4: Use Recovery Mode message for founders who are 3+ days inactive
        const isInRecovery = ctx?.recovery_mode_active === true || (ctx?.days_inactive ?? 0) >= 3;
        const message = isInRecovery ? recoveryMessage : defaultMessage;

        const payload = JSON.stringify({
          title: message.title,
          body: message.body,
          icon: "/logo/buildmind-favicon.svg",
          badge: "/logo/buildmind-favicon.svg",
          url: message.url,
          tag: message.tag,
        });

        await webpush.sendNotification(row.subscription, payload);
        return { userId: row.user_id, ok: true, isInRecovery };
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
    (r) => r.status === "fulfilled" && r.value.ok
  ).length;
  const recoveryCount = results.filter(
    (r) => r.status === "fulfilled" && r.value.ok && (r.value as { isInRecovery?: boolean }).isInRecovery
  ).length;
  const failed = results.length - sent;

  console.log(`[Daily Push] Sent: ${sent}, Recovery Mode: ${recoveryCount}, Failed: ${failed}`);

  return NextResponse.json({
    sent,
    failed,
    recoveryMode: recoveryCount,
    total: subs.length,
    message: defaultMessage.title,
  });
}

// Allow GET for manual testing in dev
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  return POST(
    new NextRequest(req.url, {
      method: "POST",
      headers: { "x-cron-secret": process.env.CRON_SECRET || "" },
    })
  );
}
