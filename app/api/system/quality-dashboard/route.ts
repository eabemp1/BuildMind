/**
 * app/api/system/quality-dashboard/route.ts
 *
 * GET → Returns reflexion_quality_log stats for the internal admin dashboard.
 * Admin-only: requires is_admin = true in the profiles table.
 *
 * Returns:
 *   - overall pass rate over time (daily buckets, last 30 days)
 *   - per-context breakdown (today_action, coach, reflect, etc.)
 *   - top reject reasons (Agent B veto reasons)
 *   - total pass / fail counts
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  // Auth check
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false }, { status: 401 });

  // Admin check
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_admin) {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    // ── 1. All log entries in the last 30 days ───────────────────────────────
    const { data: logs, error: logsErr } = await admin
      .from("reflexion_quality_log")
      .select("verdict, reject_reason, context, stage, momentum_score, created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: false });

    if (logsErr) throw logsErr;

    const entries = logs ?? [];
    const totalPass = entries.filter(e => e.verdict === "pass").length;
    const totalFail = entries.filter(e => e.verdict === "fail").length;
    const total = entries.length;
    const overallPassRate = total > 0 ? Math.round((totalPass / total) * 100) : null;

    // ── 2. Daily pass rate — last 30 days ────────────────────────────────────
    const dailyMap: Record<string, { pass: number; fail: number }> = {};
    for (const e of entries) {
      const day = e.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { pass: 0, fail: 0 };
      dailyMap[day][e.verdict as "pass" | "fail"]++;
    }
    const dailyTrend = Object.entries(dailyMap)
      .map(([date, { pass, fail }]) => ({
        date,
        pass,
        fail,
        total: pass + fail,
        passRate: pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : null,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── 3. Per-context breakdown ─────────────────────────────────────────────
    const contextMap: Record<string, { pass: number; fail: number }> = {};
    for (const e of entries) {
      const ctx = e.context ?? "unknown";
      if (!contextMap[ctx]) contextMap[ctx] = { pass: 0, fail: 0 };
      contextMap[ctx][e.verdict as "pass" | "fail"]++;
    }
    const contextBreakdown = Object.entries(contextMap).map(([context, { pass, fail }]) => ({
      context,
      pass,
      fail,
      total: pass + fail,
      passRate: pass + fail > 0 ? Math.round((pass / (pass + fail)) * 100) : null,
    })).sort((a, b) => b.total - a.total);

    // ── 4. Top reject reasons ────────────────────────────────────────────────
    const reasonMap: Record<string, number> = {};
    for (const e of entries) {
      if (e.verdict === "fail" && e.reject_reason) {
        reasonMap[e.reject_reason] = (reasonMap[e.reject_reason] ?? 0) + 1;
      }
    }
    const topRejectReasons = Object.entries(reasonMap)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // ── 5. Quality alert ─────────────────────────────────────────────────────
    // Warn if pass rate in the last 7 days drops below 60%
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const recentEntries = entries.filter(e => e.created_at >= sevenDaysAgo);
    const recentPass = recentEntries.filter(e => e.verdict === "pass").length;
    const recentTotal = recentEntries.length;
    const recentPassRate = recentTotal > 0 ? Math.round((recentPass / recentTotal) * 100) : null;
    const qualityAlert = recentPassRate !== null && recentPassRate < 60
      ? `Pass rate dropped to ${recentPassRate}% in the last 7 days (${recentTotal} evaluations). Review Agent B prompts.`
      : null;

    return NextResponse.json({
      ok: true,
      data: {
        summary: {
          total,
          totalPass,
          totalFail,
          overallPassRate,
          recentPassRate,
          qualityAlert,
        },
        dailyTrend,
        contextBreakdown,
        topRejectReasons,
      },
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
