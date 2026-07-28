/**
 * app/api/cron/morning-briefing/worker/route.ts — QStash worker, one user per invocation
 *
 * Generates and pushes a morning briefing for a single user.
 * Payload: { userId: string; subscriptionJson?: string; startupSummary?: string;
 *             stage?: string; momentumScore?: number }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { verifyQStashSignature } from "@/lib/queue";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 30;

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const pub  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live", pub, priv,
  );
  vapidConfigured = true;
}

// FIX (critical, security audit): see app/api/cron/evening-check/worker/route.ts
// for the full explanation — this had the identical structurally-broken
// manual JWT/HMAC verification (payload segment checked as if it were the
// signature, against the raw body instead of the real signing input),
// which would reject essentially every real QStash delivery in production.
// Replaced with the shared, SDK-backed helper.

export async function POST(req: NextRequest) {
  const start = Date.now();
  const rawBody = await req.text();
  if (!(await verifyQStashSignature(req, rawBody)) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Invalid QStash signature" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  let payload: {
    userId?: string; subscriptionJson?: string;
    startupSummary?: string; stage?: string; momentumScore?: number;
  };
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { userId, subscriptionJson, stage = "MVP", momentumScore = 50 } = payload;
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });

  const supabase = createClient(supabaseUrl, serviceKey);

  // Early exit if no actionable records exist for this worker payload.
  const { count: projectCount, error: projectCountError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (projectCountError) {
    return NextResponse.json({ ok: false, error: projectCountError.message, step: "count_projects" }, { status: 500 });
  }
  if (!projectCount) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  // Fetch today's briefing or generate a lightweight push nudge
  const { data: briefing } = await supabase
    .from("morning_briefings")
    .select("action, win")
    .eq("user_id", userId)
    .gte("created_at", new Date(Date.now() - 8 * 3600000).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const body = briefing?.action
    ? `Today: ${briefing.action}`
    : `Momentum at ${momentumScore}. Your ${stage}-stage task is waiting.`;

  if (subscriptionJson) {
    configureVapid();
    try {
      const sub = JSON.parse(subscriptionJson) as webpush.PushSubscription;
      await webpush.sendNotification(sub, JSON.stringify({
        title: "Good morning — BuildMind",
        body,
        icon: "/logo/icon-192.png",
        url: "/today",
        tag: "morning-briefing",
      }));
    } catch (err) {
      const code = (err as { statusCode?: number })?.statusCode;
      if (code === 410 || code === 404) {
        await supabase.from("push_subscriptions").delete().eq("user_id", userId);
      }
    }
  }

  // Log that briefing was delivered
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "morning_briefing",
    message: body,
    is_read: false,
  }).then(() => {});

  return NextResponse.json({ ok: true, userId, delivered: body, processed: 1, durationMs: Date.now() - start });
}
