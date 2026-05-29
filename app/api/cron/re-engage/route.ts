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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
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

    if (!dryRun) {
      try {
        await sendEmail({
          to: email,
          template: "re_engagement",
          data: {
            name,
            daysInactive,
            startupName,
          },
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
