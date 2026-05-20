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
 * Payload: { userId: string; subscriptionJson: string; daysInactive: number;
 *             patternMessage?: string; usePattern?: boolean }
 *
 * Security: QStash signs every request with HMAC-SHA256. We verify via
 * QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY (rolling rotation).
 * Reject any request that fails verification.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

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

/** Verify QStash HMAC-SHA256 signature — reject if invalid */
async function verifyQStashSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const sig = req.headers.get("upstash-signature");
  if (!sig) return false;

  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey    = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey && !nextKey) {
    // Dev/no-QStash mode — allow without signature
    return process.env.NODE_ENV !== "production";
  }

  const encoder = new TextEncoder();
  const keys = [currentKey, nextKey].filter(Boolean) as string[];
  for (const keyStr of keys) {
    try {
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(keyStr),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const [, payload] = sig.split(".");
      const data = encoder.encode(payload ?? "");
      const valid = await crypto.subtle.verify("HMAC", key, data, encoder.encode(rawBody));
      if (valid) return true;
    } catch {
      continue;
    }
  }
  return false;
}

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

  let payload: {
    userId?: string;
    subscriptionJson?: string;
    daysInactive?: number;
    patternMessage?: string;
    usePattern?: boolean;
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON payload" }, { status: 400 });
  }

  const { userId, subscriptionJson, daysInactive = 0, patternMessage, usePattern } = payload;
  if (!userId || !subscriptionJson) {
    return NextResponse.json({ ok: false, error: "userId and subscriptionJson required" }, { status: 400 });
  }

  let subscription: webpush.PushSubscription;
  try {
    subscription = JSON.parse(subscriptionJson) as webpush.PushSubscription;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid subscription JSON" }, { status: 400 });
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

  const body = usePattern && patternMessage ? patternMessage : eveningNudge(daysInactive);

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
      supabase.from("founder_context")
        .update({ days_inactive: daysInactive })
        .eq("user_id", userId),
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
