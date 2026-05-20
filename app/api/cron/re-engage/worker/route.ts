/**
 * app/api/cron/re-engage/worker/route.ts — QStash worker for a single re-engagement email
 *
 * The re-engage cron fans out to this endpoint once per user when QSTASH_TOKEN
 * is set. Validates QStash signature before processing. Handles exactly one user.
 *
 * Payload: { userId: string; email: string; displayName?: string;
 *             daysInactive: number; wave: "7d" | "14d" }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";

export const runtime  = "nodejs";
export const dynamic  = "force-dynamic";
export const maxDuration = 15;

async function verifyQStashSignature(req: NextRequest, rawBody: string): Promise<boolean> {
  const sig = req.headers.get("upstash-signature");
  if (!sig) return false;
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey    = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentKey && !nextKey) return process.env.NODE_ENV !== "production";
  const encoder = new TextEncoder();
  const keys = [currentKey, nextKey].filter(Boolean) as string[];
  for (const keyStr of keys) {
    try {
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(keyStr),
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
      );
      const [, payload] = sig.split(".");
      const valid = await crypto.subtle.verify("HMAC", key,
        encoder.encode(payload ?? ""), encoder.encode(rawBody));
      if (valid) return true;
    } catch { continue; }
  }
  return false;
}

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
    userId?: string; email?: string; displayName?: string;
    daysInactive?: number; wave?: "7d" | "14d";
  };
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { userId, email, displayName = "Founder", daysInactive = 7, wave = "7d" } = payload;
  if (!userId || !email) {
    return NextResponse.json({ ok: false, error: "userId and email required" }, { status: 400 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const name = displayName.split(" ")[0] || "there";

  // Early exit if no actionable records exist for this worker payload.
  const { count: contextCount, error: contextCountError } = await supabase
    .from("founder_context")
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .or("and(days_inactive.gte.6,days_inactive.lte.8),and(days_inactive.gte.13,days_inactive.lte.15)");
  if (contextCountError) {
    return NextResponse.json({ ok: false, error: contextCountError.message, step: "count_actionable" }, { status: 500 });
  }
  if (!contextCount) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  const subject = wave === "14d"
    ? `${name}, your startup hasn't moved in 2 weeks`
    : `${name}, it's been a week — what happened?`;

  const html = wave === "14d"
    ? `<p>Hey ${name},</p>
       <p>It's been 14 days. That's long enough for a good startup to go from idea to first user, or for a bad week to quietly become a bad month.</p>
       <p>You don't need a plan. You need one action. <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/today">Open BuildMind and do one thing today →</a></p>
       <p>If you've already moved on from this idea, that's fine. But let BuildMind help you figure out what's next.</p>`
    : `<p>Hey ${name},</p>
       <p>7 days without a check-in. Most founders who disappear for a week don't come back — not because they quit, but because re-starting feels bigger than it is.</p>
       <p>One task. Five minutes. That's all. <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/today">Pick up where you left off →</a></p>`;

  try {
    await sendEmail({ to: email, subject, html });
    await supabase.from("founder_context")
      .update({ last_re_engagement_email_at: new Date().toISOString() })
      .eq("user_id", userId);
    return NextResponse.json({ ok: true, userId, wave, sent: true, processed: 1, durationMs: Date.now() - start });
  } catch (err) {
    return NextResponse.json({
      ok: false, userId,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
