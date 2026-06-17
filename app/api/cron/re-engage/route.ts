/**
 * app/api/cron/re-engage/route.ts — Re-engagement email cron
 *
 * Runs daily at 09:00 UTC. Finds users who have been inactive for exactly
 * 7 days (±1 day window to handle timezone drift) and sends a single
 * re-engagement email. A second email fires at 14 days for users who
 * still haven't returned.
 *
 * Rate-limiting: one email per user per re-engagement window (7-day then
 * 14-day). Stored in founder_context.last_re_engagement_email_at so we
 * never double-send.
 *
 * Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET.
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   RESEND_API_KEY (optional — email is skipped but counter still updates)
 *   CRON_SECRET
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email";
import { generateReEngagementEmail } from "@/lib/cron/aiContent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

/** Minimal HTML shell for the AI-generated re-engagement email body */
function buildReEngagementHTML(name: string | undefined, startupName: string | undefined, daysInactive: number, aiBody: string): string {
  const firstName = name?.split(" ")[0] ?? "Founder";
  const startup   = startupName ?? "your startup";
  const paragraphs = aiBody.split("\n").filter(p => p.trim()).map(p =>
    `<p style="margin:0 0 16px;font-size:15px;color:#CECECE;line-height:1.75;">${p.trim()}</p>`
  ).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0A0A0C;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:540px;margin:40px auto;padding:0 20px;">
    <div style="margin-bottom:24px;">
      <span style="display:inline-block;padding:5px 12px;background:rgba(232,197,71,0.1);border:1px solid rgba(232,197,71,0.25);border-radius:99px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#E8C547;">BuildMind</span>
    </div>
    <h1 style="font-size:26px;font-weight:800;color:#ECECEC;letter-spacing:-0.03em;margin:0 0 8px;">${daysInactive} days. ${startup} is still waiting.</h1>
    <p style="font-size:12px;color:#56565E;margin:0 0 28px;">${firstName} · ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</p>
    <div style="margin-bottom:28px;">${paragraphs}</div>
    <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/today" style="display:inline-block;padding:13px 28px;background:#E8C547;color:#000;font-size:14px;font-weight:700;text-decoration:none;border-radius:10px;letter-spacing:-0.01em;">
      Resume where you left off →
    </a>
    <p style="margin:32px 0 0;font-size:11px;color:#3A3A42;line-height:1.6;">
      You're receiving this because you signed up for BuildMind. <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/settings" style="color:#56565E;">Manage notifications</a>
    </p>
  </div>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const start = Date.now();

  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error(
      "[buildmind] CRON_SECRET is not set. Re-engagement email cron is blocked. " +
      "Set CRON_SECRET in Vercel Environment Variables."
    );
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured. Set it in Vercel to enable re-engagement cron." },
      { status: 500 },
    );
  }

  if (!isCronRequest(req) && process.env.NODE_ENV === "production") {
    console.error("[buildmind] Re-engagement cron blocked: invalid or missing CRON_SECRET.");
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  // Early exit if no actionable records exist.
  const { count: actionableCount, error: countError } = await supabase
    .from("founder_context")
    .select("user_id", { count: "exact", head: true })
    .or("and(days_inactive.gte.6,days_inactive.lte.8),and(days_inactive.gte.13,days_inactive.lte.15)");

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message, step: "count_actionable" }, { status: 500 });
  }
  if (!actionableCount) {
    return NextResponse.json({ skipped: true, reason: "no records", durationMs: Date.now() - start });
  }

  // ── Find users inactive for 7 or 14 days ─────────────────────────────────
  // We look at founder_context.days_inactive which is maintained by the
  // evening-check cron (increments daily, resets on reflection/task activity).
  const now = new Date();
  const sevenDayWindowStart = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDayWindowEnd   = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDayWindowStart = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDayWindowEnd   = new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000).toISOString();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  const details: { userId: string; result: string }[] = [];
  let totalRows = 0;

  // Cursor-paginated fetch — prevents OOM at scale (fixes audit §3 cron issue).
  const PAGE_SIZE = 100;
  let pageFrom = 0;
  let hasMore = true;

  while (hasMore) {
    // Fetch contexts where days_inactive is in the 7-day or 14-day window
    const { data: contexts, error: ctxError } = await supabase
      .from("founder_context")
      .select("user_id, days_inactive, last_re_engagement_email_at")
      .or(`and(days_inactive.gte.6,days_inactive.lte.8),and(days_inactive.gte.13,days_inactive.lte.15)`)
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);

    if (ctxError) {
      return NextResponse.json({ ok: false, error: ctxError.message }, { status: 500 });
    }

    const rows = contexts ?? [];
    totalRows += rows.length;
    hasMore = rows.length === PAGE_SIZE;
    pageFrom += PAGE_SIZE;

  for (const ctx of rows) {
    const daysInactive: number = ctx.days_inactive ?? 0;

    // Decide which wave this is
    const isSevenDay     = daysInactive >= 6 && daysInactive <= 8;
    const isFourteenDay  = daysInactive >= 13 && daysInactive <= 15;
    if (!isSevenDay && !isFourteenDay) { skipped++; continue; }

    // Skip if already sent in this window
    const lastSentAt = ctx.last_re_engagement_email_at;
    if (lastSentAt) {
      const lastSent = new Date(lastSentAt);
      // Don't re-send within a 5-day window of the last email
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      if (lastSent > fiveDaysAgo) {
        skipped++;
        details.push({ userId: ctx.user_id, result: "skipped:too_recent" });
        continue;
      }
    }

    // Look up user profile + project for context
    const [authResult, projectResult] = await Promise.allSettled([
      supabase.auth.admin.getUserById(ctx.user_id),
      supabase
        .from("projects")
        .select("title")
        .eq("user_id", ctx.user_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const authUser =
      authResult.status === "fulfilled" ? authResult.value.data?.user : null;
    const email = authUser?.email;
    if (!email) { skipped++; continue; }

    const name = (authUser?.user_metadata?.full_name as string | undefined) ?? undefined;
    const startupName =
      projectResult.status === "fulfilled"
        ? (projectResult.value.data?.title as string | undefined)
        : undefined;

    // Fetch last reflection note for deeper personalisation
    let lastReflectionNote: string | undefined;
    try {
      const { data: lastRefl } = await supabase
        .from("reflections")
        .select("note")
        .eq("user_id", ctx.user_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastReflectionNote = (lastRefl?.note as string | undefined) ?? undefined;
    } catch { /* non-fatal */ }

    // Fetch avoidance zone
    let avoidanceZone: string | undefined;
    try {
      const { data: mem } = await supabase
        .from("founder_memory")
        .select("avoidance_zones")
        .eq("user_id", ctx.user_id)
        .maybeSingle();
      avoidanceZone = (mem?.avoidance_zones as string[] | undefined)?.[0];
    } catch { /* non-fatal */ }

    if (!dryRun) {
      try {
        // Generate AI-written subject + body
        const aiContent = await generateReEngagementEmail({
          name,
          startupName,
          stage: undefined,   // not fetched in this cron — add if needed
          daysInactive,
          avoidanceZone,
          lastReflectionNote,
        });

        await sendEmail({
          to: email,
          subject: aiContent.subject,
          html: buildReEngagementHTML(name, startupName, daysInactive, aiContent.body),
        });

        // Record that we sent, so we don't double-send
        await supabase
          .from("founder_context")
          .update({ last_re_engagement_email_at: now.toISOString() })
          .eq("user_id", ctx.user_id);

        sent++;
        details.push({ userId: ctx.user_id, result: `sent:${isSevenDay ? "7day" : "14day"}` });
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        details.push({ userId: ctx.user_id, result: `failed:${msg.slice(0, 80)}` });
      }
    } else {
      // Dry run — just report who would get an email
      details.push({ userId: ctx.user_id, result: `dry_run:${isSevenDay ? "7day" : "14day"}:${email}` });
      sent++;
    }
  }

  } // end while (pagination)

  return NextResponse.json({
    ok: true,
    dryRun,
    totalEvaluated: totalRows,
    processed: totalRows,
    durationMs: Date.now() - start,
    sent,
    skipped,
    failed,
    details: dryRun ? details : undefined, // Only expose details in dry-run to avoid PII in logs
  });
}
