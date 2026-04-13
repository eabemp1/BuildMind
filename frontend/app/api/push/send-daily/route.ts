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

function getRequiredEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live";
  return { supabaseUrl, serviceRoleKey, vapidPublicKey, vapidPrivateKey, vapidSubject };
}

// Notification templates — rotated daily to avoid fatigue
const DAILY_MESSAGES = [
  {
    title: "⚡ BuildMind — Your action is ready",
    body: "Today's task is waiting. One action. Already decided. Open it.",
    url: "/today",
    tag: "daily-action",
  },
  {
    title: "🔥 Don't break your streak",
    body: "Your momentum is building. Open BuildMind and do today's action.",
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

function getDailyMessage() {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_MESSAGES[dayOfYear % DAILY_MESSAGES.length];
}

export async function POST(req: NextRequest) {
  const env = getRequiredEnv();
  if (!env.supabaseUrl || !env.serviceRoleKey || !env.vapidPublicKey || !env.vapidPrivateKey) {
    return NextResponse.json(
      {
        error:
          "Missing required env vars for push: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY",
      },
      { status: 500 }
    );
  }

  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);

  // Verify this is called by cron or Supabase edge function
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Admin Supabase client (bypasses RLS)
  const supabase = createClient(env.supabaseUrl, env.serviceRoleKey);

  // Fetch all push subscriptions
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

  const message = getDailyMessage();
  const payload = JSON.stringify({
    title: message.title,
    body: message.body,
    icon: "/logo/buildmind-favicon.svg",
    badge: "/logo/buildmind-favicon.svg",
    url: message.url,
    tag: message.tag,
  });

  // Send to all subscribers, collect failures
  const results = await Promise.allSettled(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        return { userId: row.user_id, ok: true };
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

  const failed = results.length - sent;

  console.log(`[Daily Push] Sent: ${sent}, Failed: ${failed}`);

  return NextResponse.json({
    sent,
    failed,
    total: subs.length,
    message: message.title,
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
