/**
 * app/api/cron/milestone-stall/route.ts — Milestone stall detection cron
 *
 * Daily scan for milestones that have been open (started_at set, not
 * completed) well past their estimated_days. Fires the same
 * /api/ai/milestone-break interstitial used for milestone_complete and
 * stage_transition, with triggerType: "stalling".
 *
 * Depends on:
 *   - migrations/20260731000000_milestone_estimates_stall_detection.sql
 *     (difficulty, estimated_days, started_at, stall_alert_count,
 *     last_stall_alert_at columns on milestones)
 *   - app/api/ai/generate-roadmap/route.ts (writes estimates + started_at)
 *   - lib/buildmind.ts updateTaskStatus (writes started_at on first task touch)
 *   - app/api/ai/milestone-break/route.ts (CRON_SECRET auth path added
 *     alongside this cron)
 *
 * Threshold: difficulty-adjusted multiplier of estimated_days, not a flat
 * number — a difficulty-5 milestone is expected to run over more than a
 * difficulty-1 one before it's genuinely "stalled" rather than just hard.
 * See STALL_MULTIPLIER below. This is a heuristic starting point, not a
 * tuned constant — expect to revisit once real data exists.
 *
 * Re-alerts on a cooldown (not every day) while still stalled, capped at
 * a small number of alerts. Beyond that cap this cron intentionally does
 * nothing further — deciding what happens after repeated stalls (split
 * the milestone? force a re-plan?) is Phase 2 (recalibration + pivot-on-drag),
 * not built here.
 *
 * Triggered by Vercel Cron (see vercel.json). Protected by CRON_SECRET,
 * same pattern as app/api/cron/re-engage/route.ts.
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CRON_SECRET
 *   NEXT_PUBLIC_APP_URL (to call milestone-break internally)
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

// Difficulty-adjusted "how far over estimate before this counts as
// stalled" multiplier. difficulty null/unrated treated as 3 (mid).
function stallMultiplier(difficulty: number | null): number {
  const d = difficulty ?? 3;
  return 1.3 + Math.max(0, d - 3) * 0.15; // 1.3x at diff<=3, up to 1.6x at diff 5
}

// Re-alert cooldown and cap — avoid daily nagging once a stall is flagged.
const REALERT_COOLDOWN_DAYS = 10;
const MAX_ALERTS_PER_MILESTONE = 5;

type StallCandidate = {
  id: string;
  project_id: string;
  user_id: string | null;
  title: string;
  status: string | null;
  difficulty: number | null;
  estimated_days: number | null;
  started_at: string;
  stall_alert_count: number | null;
  last_stall_alert_at: string | null;
};

export async function GET(req: NextRequest) {
  const start = Date.now();

  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error("[buildmind] CRON_SECRET is not set. Milestone-stall cron is blocked.");
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET not configured." },
      { status: 500 },
    );
  }
  if (!isCronRequest(req) && process.env.NODE_ENV === "production") {
    console.error("[buildmind] Milestone-stall cron blocked: invalid or missing CRON_SECRET.");
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ ok: false, error: "Supabase env vars missing" }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live";
  const now = new Date();

  let flagged = 0;
  let skipped = 0;
  let failed = 0;
  const details: { milestoneId: string; result: string }[] = [];

  // Cursor-paginated fetch — same pattern as re-engage cron, prevents OOM
  // at scale. Only candidates: active (started, not completed), has an
  // estimate to compare against (placeholder milestones with no estimate
  // are skipped — nothing to measure "over" against), under the alert cap.
  const PAGE_SIZE = 100;
  let pageFrom = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: rows, error } = await supabase
      .from("milestones")
      // CONFIRMED (repo-wide grep): milestones.is_completed is never set
      // true by the live completion path — only `status` is written (see
      // lib/buildmind.ts updateTaskStatus). Filtering on is_completed here
      // would silently never exclude completed milestones. Using status
      // instead, which is what the real write path actually sets.
      .select("id, project_id, user_id, title, status, difficulty, estimated_days, started_at, stall_alert_count, last_stall_alert_at")
      .neq("status", "completed")
      .not("started_at", "is", null)
      .not("estimated_days", "is", null)
      .lt("stall_alert_count", MAX_ALERTS_PER_MILESTONE)
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, step: "fetch_candidates" }, { status: 500 });
    }

    const batch = (rows ?? []) as StallCandidate[];
    hasMore = batch.length === PAGE_SIZE;
    pageFrom += PAGE_SIZE;

    for (const m of batch) {
      if (!m.user_id) {
        // Old row never backfilled with user_id — skip rather than guess.
        skipped++;
        details.push({ milestoneId: m.id, result: "skipped:no_user_id" });
        continue;
      }

      const startedAt = new Date(m.started_at);
      const daysOpen = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
      const threshold = (m.estimated_days ?? 0) * stallMultiplier(m.difficulty);

      if (daysOpen < threshold) {
        skipped++;
        continue; // not stalled yet
      }

      // Cooldown: don't re-fire more than once per REALERT_COOLDOWN_DAYS.
      if (m.last_stall_alert_at) {
        const lastAlert = new Date(m.last_stall_alert_at);
        const daysSinceAlert = (now.getTime() - lastAlert.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceAlert < REALERT_COOLDOWN_DAYS) {
          skipped++;
          details.push({ milestoneId: m.id, result: "skipped:cooldown" });
          continue;
        }
      }

      const daysOverEstimate = Math.round(daysOpen - (m.estimated_days ?? 0));

      if (dryRun) {
        flagged++;
        details.push({ milestoneId: m.id, result: `would_flag:${daysOverEstimate}d_over` });
        continue;
      }

      try {
        const res = await fetch(`${appUrl}/api/ai/milestone-break`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": process.env.CRON_SECRET ?? "",
          },
          body: JSON.stringify({
            userId: m.user_id,
            projectId: m.project_id,
            milestoneTitle: m.title,
            triggerType: "stalling",
            daysOverEstimate,
            difficulty: m.difficulty ?? 0,
          }),
        });

        if (!res.ok) {
          failed++;
          details.push({ milestoneId: m.id, result: `failed:milestone_break_${res.status}` });
          continue;
        }

        await supabase
          .from("milestones")
          .update({
            stall_alert_count: (m.stall_alert_count ?? 0) + 1,
            last_stall_alert_at: now.toISOString(),
          })
          .eq("id", m.id);

        flagged++;
        details.push({ milestoneId: m.id, result: `flagged:${daysOverEstimate}d_over` });
      } catch (err) {
        failed++;
        details.push({ milestoneId: m.id, result: `failed:${err instanceof Error ? err.message : "unknown"}` });
      }
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    flagged,
    skipped,
    failed,
    durationMs: Date.now() - start,
    details: details.slice(0, 50), // cap response size
  });
}
