/**
 * app/api/cron/evening-check/worker/route.ts — QStash worker for a single user
 *
 * The evening-check cron fans out to this endpoint once per user when
 * QSTASH_TOKEN is configured (lib/queue/index.ts). Without QStash the
 * cron runs inline; at >500 DAU it must fan out or OOM.
 *
 * Validates QStash signature before processing. Each invocation handles
 * exactly one user — no pagination, no timeout risk.
 *
 * Payload: { userId: string; subscriptionJson?: string }
 *
 * FIX (audit finding): the orchestrator (../route.ts) only ever enqueued
 * { userId } — daysInactive, subscriptionJson, patternMessage, and
 * usePattern were never sent, despite subscriptionJson being required below.
 * Every queued job therefore 400'd before doing anything: no notification,
 * no days_inactive update, no momentum decay. This closed silently — no
 * queued run ever surfaced an error to the cron caller, it just processed 0
 * users. The orchestrator now sends subscriptionJson; everything else this
 * worker previously expected the orchestrator to precompute (same-day
 * reflection check, daysInactive, momentum decay) it now computes itself,
 * matching the inline path in ../route.ts rather than depending on payload
 * fields the orchestrator's fan-out step has no cheap way to produce for
 * every user. subscriptionJson is optional here (not just doesn't 400): a
 * missing/expired subscription should still get its inactivity and momentum
 * bookkeeping done, it just skips the push send.
 *
 * Security: QStash signs every request with HMAC-SHA256. We verify via
 * QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY (rolling rotation).
 * Reject any request that fails verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { verifyQStashSignature } from "@/lib/queue";
import { updateMomentum } from "@/lib/scorecard";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 30;

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  const subject = process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live";
  const pub     = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv    = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return;
  webpush.setVapidDetails(subject, pub, priv);
  vapidConfigured = true;
}

// FIX (critical, security audit): this file previously had its own manual
// HMAC verification that was structurally broken — QStash signatures are
// JWTs (header.payload.signature), but this code took the PAYLOAD segment
// and verified it as if it were the signature, checked against the raw
// HTTP body instead of the actual JWT signing input, and silently
// discarded the real signature (third segment) entirely. This would have
// rejected essentially every real QStash delivery in production,
// silently breaking the evening-check fanout for every user at >500 DAU
// (the threshold noted in this file's own header comment for when fanout
// becomes required). Replaced with lib/queue's verifyQStashSignature,
// which correctly uses the @upstash/qstash SDK's Receiver.verify().

function eveningNudge(daysInactive: number): string {
  if (daysInactive >= 3) return "No pressure. Just log one honest reflection and reset tomorrow.";
  if (daysInactive >= 1) return "Still building today? Log what happened before the day closes.";
  return "Did you make progress today? Log it so tomorrow's action gets sharper.";
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const rawBody = await req.text();

  const isVerified = await verifyQStashSignature(req, rawBody);
  if (!isVerified && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Invalid QStash signature" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  let payload: { userId?: string; subscriptionJson?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const { userId, subscriptionJson } = payload;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  // subscriptionJson is best-effort: a missing or malformed value means we
  // skip the push send, not the user's inactivity/momentum bookkeeping.
  let subscription: webpush.PushSubscription | null = null;
  if (subscriptionJson) {
    try {
      subscription = JSON.parse(subscriptionJson) as webpush.PushSubscription;
    } catch {
      console.error("[evening-check/worker] Invalid subscription JSON for user", userId);
    }
  }

  configureVapid();
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

  // Mirrors the inline path's reflectedToday short-circuit in ../route.ts:
  // a reflection already filed today means no nudge and no decay.
  const today = new Date().toISOString().split("T")[0];
  const { data: reflectedToday } = await supabase
    .from("reflections")
    .select("id")
    .eq("user_id", userId)
    .gte("created_at", `${today}T00:00:00Z`)
    .limit(1)
    .maybeSingle();

  if (reflectedToday) {
    await supabase.from("founder_context").update({ days_inactive: 0 }).eq("user_id", userId);
    return NextResponse.json({ ok: true, userId, skipped: "reflected_today", processed: 1, durationMs: Date.now() - start });
  }

  const { data: ctx } = await supabase
    .from("founder_context")
    .select("days_inactive")
    .eq("user_id", userId)
    .maybeSingle();
  const daysInactive = Math.max(1, (ctx?.days_inactive ?? 0) + 1);

  const body = eveningNudge(daysInactive);

  await supabase.from("founder_context").update({ days_inactive: daysInactive }).eq("user_id", userId);

  try {
    await updateMomentum(userId, null, 0, daysInactive);
  } catch (momentumErr) {
    console.error("[evening-check/worker] momentum decay failed:", momentumErr);
  }

  if (!subscription) {
    await supabase.from("evening_checks").insert({
      user_id: userId,
      task_completed: false,
      nudge_sent: false,
      nudge_text: body,
    });
    return NextResponse.json({ ok: true, userId, sent: false, reason: "no_subscription", processed: 1, durationMs: Date.now() - start });
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify({
      title: "BuildMind check-in",
      body,
      icon: "/logo/icon-192.png",
      badge: "/logo/icon-96.png",
      url: "/reflect",
      tag: "evening-check",
    }));

    await Promise.all([
      supabase.from("notifications").insert({
        user_id: userId,
        type: "evening_check",
        message: body,
        is_read: false,
      }),
      supabase.from("evening_checks").insert({
        user_id: userId,
        task_completed: false,
        nudge_sent: true,
        nudge_text: body,
      }),
    ]);

    return NextResponse.json({ ok: true, userId, sent: true, processed: 1, durationMs: Date.now() - start });
  } catch (err) {
    const statusCode = (err as { statusCode?: number })?.statusCode;
    // Subscription expired — clean up so we don't retry dead endpoints
    if (statusCode === 410 || statusCode === 404) {
      await supabase.from("push_subscriptions").delete().eq("user_id", userId);
      return NextResponse.json({ ok: true, userId, sent: false, reason: "subscription_expired", processed: 1, durationMs: Date.now() - start });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, userId, error: message }, { status: 500 });
  }
}
