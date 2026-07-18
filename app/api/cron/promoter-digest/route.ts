import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { logError } from "@/lib/server/logger";

/**
 * GET /api/cron/promoter-digest
 * Scheduled daily (see vercel.json). Two jobs in one route, matching the
 * existing cron conventions in this codebase:
 *
 *   1. Reminder — any promoter with an email on file who hasn't logged
 *      activity in 3+ days gets a short, low-pressure nudge. Nobody without
 *      an email is contacted (email is optional at creation).
 *   2. Owner digest — every Friday, you get one email summarizing every
 *      promoter's momentum and conversions, so you don't have to check
 *      /admin/promoters manually.
 */

function getCronSecret(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return request.headers.get("x-cron-secret") ?? bearer;
}

function isCronRequest(request: Request): boolean {
  return Boolean(process.env.CRON_SECRET && getCronSecret(request) === process.env.CRON_SECRET);
}

function computeMomentum(activity: { completed_at: string }[]): number {
  if (!activity.length) return 0;
  const now = Date.now();
  let score = 0;
  for (const a of activity) {
    const daysAgo = (now - new Date(a.completed_at).getTime()) / 86_400_000;
    score += Math.exp(-daysAgo / 8) * 14;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(request: Request) {
  if (!isCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized", hint: "Vercel Cron must send Authorization: Bearer <CRON_SECRET>." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: promoters } = await admin
    .from("promoters")
    .select("id, name, email, access_token, created_by, created_at");

  const rows = promoters ?? [];
  const results: { promoter: string; momentum: number; totalLogged: number; conversions: number; lastActive: string | null }[] = [];
  let reminded = 0;

  for (const p of rows) {
    const { data: activity } = await admin
      .from("promoter_activity")
      .select("completed_at")
      .eq("promoter_id", p.id)
      .order("completed_at", { ascending: false })
      .limit(200);

    const { count: conversionCount } = await admin
      .from("promoter_conversions")
      .select("*", { count: "exact", head: true })
      .eq("promoter_id", p.id);

    const acts = activity ?? [];
    const lastActive = acts[0]?.completed_at ?? null;
    const daysSinceActive = lastActive
      ? (Date.now() - new Date(lastActive).getTime()) / 86_400_000
      : (Date.now() - new Date(p.created_at).getTime()) / 86_400_000;

    results.push({
      promoter: p.name,
      momentum: computeMomentum(acts),
      totalLogged: acts.length,
      conversions: conversionCount ?? 0,
      lastActive,
    });

    // ── Job 1: reminder for quiet promoters ──────────────────────────────
    if (p.email && daysSinceActive >= 3) {
      try {
        await sendEmail({
          to: p.email,
          subject: "Your BuildMind mission is waiting",
          html: `
            <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
              <p>Hey ${p.name.split(" ")[0]},</p>
              <p>No pressure at all — just a heads up that there's a fresh mission waiting whenever you have a minute:</p>
              <p><a href="https://buildmind.live/promote/${p.access_token}" style="display:inline-block;background:#6366f1;color:white;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">Open your dashboard</a></p>
              <p style="color:#888;font-size:13px;">Everything's already written for you — just copy, personalize, post.</p>
            </div>
          `,
        });
        reminded++;
      } catch (err) {
        logError("cron/promoter-digest/reminder", err, { promoterId: p.id });
      }
    }
  }

  // ── Job 2: owner digest, Fridays only ──────────────────────────────────
  const isFriday = new Date().getUTCDay() === 5;
  let ownerDigestSent = false;
  if (isFriday && rows.length > 0) {
    const ownerIds = [...new Set(rows.map(p => p.created_by).filter(Boolean))] as string[];
    for (const ownerId of ownerIds) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(ownerId);
        const ownerEmail = userData?.user?.email;
        if (!ownerEmail) continue;

        const rowsHtml = results
          .sort((a, b) => b.conversions - a.conversions)
          .map(r => `<tr><td style="padding:6px 10px;">${r.promoter}</td><td style="padding:6px 10px;">${r.momentum}</td><td style="padding:6px 10px;">${r.totalLogged}</td><td style="padding:6px 10px;font-weight:700;color:${r.conversions > 0 ? "#16a34a" : "#888"};">${r.conversions}</td></tr>`)
          .join("");

        await sendEmail({
          to: ownerEmail,
          subject: `Your promoters this week — ${results.reduce((s, r) => s + r.conversions, 0)} signups driven`,
          html: `
            <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto;">
              <h2>Weekly promoter digest</h2>
              <table style="border-collapse:collapse;width:100%;">
                <tr style="text-align:left;color:#888;font-size:12px;"><th>Name</th><th>Momentum</th><th>Logged</th><th>Signups</th></tr>
                ${rowsHtml}
              </table>
              <p style="margin-top:16px;"><a href="https://buildmind.live/admin/promoters">See full dashboard →</a></p>
            </div>
          `,
        });
        ownerDigestSent = true;
      } catch (err) {
        logError("cron/promoter-digest/owner-digest", err, { ownerId });
      }
    }
  }

  return NextResponse.json({ ok: true, promotersChecked: rows.length, reminded, ownerDigestSent });
}
