/**
 * supabase/functions/send-daily-push/index.ts
 *
 * Supabase Edge Function — FREE replacement for Vercel cron jobs.
 *
 * HOW TO DEPLOY (one-time setup):
 * ─────────────────────────────────────────────────────────────
 * 1. Install Supabase CLI:
 *      npm install -g supabase
 *
 * 2. Link your project:
 *      supabase login
 *      supabase link --project-ref YOUR_PROJECT_REF
 *
 * 3. Set secrets (run once):
 *      supabase secrets set VAPID_SUBJECT=mailto:hello@buildmind.live
 *      supabase secrets set NEXT_PUBLIC_VAPID_PUBLIC_KEY=your_public_key
 *      supabase secrets set VAPID_PRIVATE_KEY=your_private_key
 *      supabase secrets set CRON_SECRET=your_random_secret
 *      supabase secrets set APP_URL=https://buildmind.live
 *
 * 4. Deploy the function:
 *      supabase functions deploy send-daily-push --no-verify-jwt
 *
 * 5. Schedule it with pg_cron (run in Supabase SQL editor):
 *
 *      -- Enable pg_cron extension (free on all Supabase plans)
 *      create extension if not exists pg_cron;
 *
 *      -- Schedule: every day at 6:00 AM UTC
 *      select cron.schedule(
 *        'daily-push-notifications',
 *        '0 6 * * *',
 *        $$
 *          select net.http_post(
 *            url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-daily-push',
 *            headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb,
 *            body := '{}'::jsonb
 *          );
 *        $$
 *      );
 *
 *      -- To view scheduled jobs:
 *      select * from cron.job;
 *
 *      -- To remove the schedule:
 *      select cron.unschedule('daily-push-notifications');
 *
 * WHY THIS IS BETTER THAN VERCEL CRON:
 *   - Free on all Supabase plans (even the free tier)
 *   - No Vercel Pro required
 *   - Runs close to your database (low latency for Supabase queries)
 *   - Reliable — pg_cron is battle-tested PostgreSQL extension
 *   - Logs visible in Supabase dashboard → Edge Functions → Logs
 *
 * ALTERNATIVELY — use Render cron jobs (render.yaml already in project):
 *   You already have render.yaml with a web service. Render's free tier
 *   supports cron jobs. Add to render.yaml:
 *
 *     - type: cron
 *       name: daily-push
 *       runtime: node
 *       schedule: "0 6 * * *"
 *       buildCommand: ""
 *       startCommand: >
 *         curl -X POST https://buildmind.live/api/push/send-daily
 *         -H "x-cron-secret: $CRON_SECRET"
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Notification templates — rotated daily
const DAILY_MESSAGES = [
  { title: "⚡ BuildMind — Your action is ready", body: "Today's task is waiting. One action. Already decided. Open it.", url: "/today", tag: "daily-action" },
  { title: "🔥 Don't break your streak", body: "Your momentum is building. Open BuildMind and do today's action.", url: "/today", tag: "daily-action" },
  { title: "⚡ One task. That's all.", body: "Not a checklist. Not a plan. One specific action for your startup today.", url: "/today", tag: "daily-action" },
  { title: "🧠 What did you build yesterday?", body: "Reflect on yesterday. Get your action for today. 2 minutes.", url: "/reflect", tag: "daily-reflect" },
  { title: "📋 Weekly report ready", body: "Your intention vs action report is ready. How did you do?", url: "/reports", tag: "weekly-report" },
];

function getDailyMessage() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  return DAILY_MESSAGES[dayOfYear % DAILY_MESSAGES.length];
}

/**
 * Simple VAPID signing using Web Crypto API (available in Deno/Edge runtime).
 * This replaces the web-push npm package which doesn't work in edge runtimes.
 */
async function signVapid(audience: string, subject: string, privateKeyB64: string): Promise<string> {
  const header = btoa(JSON.stringify({ typ: "JWT", alg: "ES256" })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const now = Math.floor(Date.now() / 1000);
  const payload = btoa(JSON.stringify({ aud: audience, exp: now + 43200, sub: subject })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${header}.${payload}`;
  const keyBytes = Uint8Array.from(atob(privateKeyB64.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "pkcs8", keyBytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${signingInput}.${sigB64}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const vapidPublic = Deno.env.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") ?? "";
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:hello@buildmind.live";

  if (!vapidPublic || !vapidPrivate) {
    return new Response(JSON.stringify({ error: "VAPID keys not configured" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const { data: subs, error } = await supabase.from("push_subscriptions").select("user_id, subscription");

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, message: "No subscribers" }));
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

  let sent = 0, failed = 0;

  await Promise.allSettled(subs.map(async (row) => {
    try {
      const sub = row.subscription as { endpoint: string; keys: { p256dh: string; auth: string } };
      const origin = new URL(sub.endpoint).origin;

      const jwt = await signVapid(origin, vapidSubject, vapidPrivate);

      const res = await fetch(sub.endpoint, {
        method: "POST",
        headers: {
          "Authorization": `vapid t=${jwt},k=${vapidPublic}`,
          "Content-Type": "application/octet-stream",
          "Content-Encoding": "aes128gcm",
          "TTL": "86400",
        },
        body: new TextEncoder().encode(payload),
      });

      if (res.status === 410 || res.status === 404) {
        // Expired subscription — clean up
        await supabase.from("push_subscriptions").delete().eq("user_id", row.user_id);
        failed++;
      } else {
        sent++;
      }
    } catch {
      failed++;
    }
  }));

  console.log(`[Daily Push] sent=${sent} failed=${failed} total=${subs.length}`);
  return new Response(JSON.stringify({ sent, failed, total: subs.length, message: message.title }), {
    headers: { "Content-Type": "application/json" },
  });
});
