/**
 * app/api/cron/meta-critic/route.ts — Meta-Critic weekly job (Audit v8 AI #4)
 *
 * PROBLEM: The Reflexion Loop Critic evaluates each action in isolation.
 * If the Critic passed 6/7 outputs but the founder completed only 2, something
 * is systemically wrong — tasks may be correct but framing/difficulty is off.
 * Without a meta check, this signal is invisible.
 *
 * WHAT IT DOES:
 *   1. Fetch last 7 days of action_logs for all active founders
 *   2. Compare reflexion_verdict pass rate vs outcome completion rate per user
 *   3. If gap detected (critic > 70%, completion < 40%), write a "framing_gap"
 *      signal to founder_context so the next Generator adjusts framing/difficulty
 *
 * Add to vercel.json crons: { "path": "/api/cron/meta-critic", "schedule": "0 6 * * 0" }
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { logError, logInfo } from "@/lib/server/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isCronRequest(request: Request): boolean {
  const auth = request.headers.get("authorization");
  const token = auth?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
    ?? request.headers.get("x-cron-secret");
  return Boolean(process.env.CRON_SECRET && token === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  const start = Date.now();

  if (!isCronRequest(request) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminEnv()) {
    return NextResponse.json({ success: false, error: "Missing admin env" }, { status: 500 });
  }

  const supabase = createAdminClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weekOf = new Date().toISOString().split("T")[0];

  // Early exit if no actionable records exist.
  const { count, error: countError } = await supabase
    .from("action_logs")
    .select("user_id", { count: "exact", head: true })
    .gte("created_at", sevenDaysAgo)
    .not("reflexion_verdict", "is", null);

  if (countError) {
    logError("meta-critic/count", countError, { route: "/api/cron/meta-critic" });
    return NextResponse.json({ success: false, error: countError.message }, { status: 500 });
  }
  if (!count) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  const { data: logs, error } = await supabase
    .from("action_logs")
    .select("user_id, outcome, reflexion_verdict, created_at")
    .gte("created_at", sevenDaysAgo)
    .not("reflexion_verdict", "is", null);

  if (error) {
    logError("meta-critic/fetch", error, { route: "/api/cron/meta-critic" });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  type Row = { user_id: string; outcome: string | null; reflexion_verdict: string | null };
  const byUser = new Map<string, Row[]>();
  for (const row of (logs ?? []) as Row[]) {
    if (!byUser.has(row.user_id)) byUser.set(row.user_id, []);
    byUser.get(row.user_id)!.push(row);
  }

  let gapsDetected = 0;
  const updates: Promise<unknown>[] = [];

  for (const [userId, rows] of byUser.entries()) {
    if (rows.length < 3) continue;

    const criticPassed   = rows.filter(r => r.reflexion_verdict === "pass").length;
    const completed      = rows.filter(r => r.outcome === "completed").length;
    const total          = rows.length;
    const criticPassRate = criticPassed / total;
    const completionRate = completed / total;
    const hasFramingGap  = criticPassRate > 0.7 && completionRate < 0.4;

    if (hasFramingGap) {
      gapsDetected++;
      const signal = `Tasks passed the AI Critic ${Math.round(criticPassRate * 100)}% of the time this week but were only completed ${Math.round(completionRate * 100)}% of the time. The tasks may be correct but the framing, difficulty, or required platform is not matching this founder's current reality. On the next generation: make tasks smaller, more concrete, and use the platform this founder has already shown up on.`;

      logInfo("meta-critic/gap", "Framing gap detected", { userId, criticPassRate: Math.round(criticPassRate*100), completionRate: Math.round(completionRate*100), total });

      updates.push(Promise.resolve(
        supabase.from("founder_context")
          .update({ meta_critic_last_run: new Date().toISOString(), meta_critic_gap_detected: true, meta_critic_signal: signal })
          .eq("user_id", userId)
          .then(() => undefined, (err: unknown) => logError("meta-critic/update", err, { userId }))
      ));
    } else {
      updates.push(Promise.resolve(
        supabase.from("founder_context")
          .update({ meta_critic_last_run: new Date().toISOString(), meta_critic_gap_detected: false })
          .eq("user_id", userId)
          .then(() => undefined, () => undefined)
      ));
    }
  }

  await Promise.allSettled(updates);
  return NextResponse.json({ success: true, analyzed: byUser.size, processed: count, framingGapsDetected: gapsDetected, weekOf, durationMs: Date.now() - start });
}
