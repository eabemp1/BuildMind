/**
 * app/api/cron/weekly-report/route.ts
 *
 * Weekly report cron — fires every Friday at 7:00 UTC (vercel.json).
 *
 * Fixes applied:
 *   1. Paginated listUsers — no silent truncation at 1,000 users.
 *   2. Actually pushes the report notification to builder users via web-push
 *      instead of logging and exiting (the old stub behaviour).
 *
 * The full report content is generated on-demand when founders visit /reports.
 * This cron's job is to bring the report *to* them — the system posts without
 * the founder having to remember to open anything.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function getCronSecret(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return request.headers.get("x-cron-secret") ?? bearer;
}

function isCronRequest(request: Request): boolean {
  return Boolean(process.env.CRON_SECRET && getCronSecret(request) === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  const start = Date.now();

  if (!process.env.CRON_SECRET && process.env.NODE_ENV === "production") {
    console.error(
      "[buildmind] CRON_SECRET is not set. Weekly report cron is blocked. " +
      "Set CRON_SECRET in Vercel Environment Variables."
    );
    return NextResponse.json(
      { success: false, error: "CRON_SECRET not configured. Set it in Vercel to enable weekly report cron." },
      { status: 500 },
    );
  }

  if (!isCronRequest(request) && process.env.NODE_ENV === "production") {
    console.error("[buildmind] Weekly report cron blocked: invalid or missing CRON_SECRET.");
    return NextResponse.json(
      { success: false, error: "Unauthorized", hint: "Vercel Cron must send Authorization: Bearer <CRON_SECRET>." },
      { status: 401 },
    );
  }

  if (!hasAdminEnv()) {
    return NextResponse.json(
      { success: false, error: "Supabase admin env is missing." },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  const now = new Date();

  // Early exit if no actionable records exist.
  const { count: subscriptionCount } = await supabase
    .from("subscriptions")
    .select("user_id", { count: "exact", head: true })
    .eq("plan", "builder")
    .in("status", ["active", "grace"]);
  const { count: trialCount } = await supabase
    .from("founder_context")
    .select("user_id", { count: "exact", head: true })
    .gt("trial_ends_at", now.toISOString());

  if (!subscriptionCount && !trialCount) {
    return NextResponse.json({ skipped: true, reason: "no records", processed: 0, durationMs: Date.now() - start });
  }

  // ── Fix 1: Paginated user fetch — no silent cap at 1,000 ───────────────────
  const PAGE_SIZE = 200;
  const allAuthUsers: Array<{ id: string; user_metadata?: Record<string, unknown> }> = [];
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    allAuthUsers.push(...(data?.users ?? []));
    if ((data?.users ?? []).length < PAGE_SIZE) break;
  }

  // Include both paid builder users and active trial users
  const { data: trialRows } = await supabase
    .from("founder_context")
    .select("user_id, trial_ends_at")
    .gt("trial_ends_at", now.toISOString());

  const trialUserIds = new Set((trialRows ?? []).map((r: { user_id: string }) => r.user_id));

  const builderUsers = allAuthUsers.filter(
    (u) => u.user_metadata?.plan === "builder" || trialUserIds.has(u.id),
  );

  // ── Fix 2: Actually deliver the weekly report via push ─────────────────────
  const builderIds = builderUsers.map((u) => u.id);
  let pushed = 0;
  let skipped = 0;
  const pushErrors: string[] = [];

  if (builderIds.length > 0) {
    const hasVapid =
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY;

    if (!hasVapid) {
      skipped = builderIds.length;
    } else {
      const webpush = (await import("web-push")).default;
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!,
      );

      const BATCH = 50;
      for (let i = 0; i < builderIds.length; i += BATCH) {
        const batch = builderIds.slice(i, i + BATCH);
        const { data: subs } = await supabase
          .from("push_subscriptions")
          .select("user_id, subscription")
          .in("user_id", batch);

        if (!subs?.length) continue;

        await Promise.allSettled(
          subs.map(async (row) => {
            try {
              // Fetch this user's week data for personalised push body
              const weekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
              const [ctxRes, logsRes] = await Promise.allSettled([
                supabase.from("founder_context").select("momentum_score, streak").eq("user_id", row.user_id).maybeSingle(),
                supabase.from("action_logs").select("outcome").eq("user_id", row.user_id).gte("created_at", weekAgoIso),
              ]);

              const ctx  = ctxRes.status  === "fulfilled" ? ctxRes.value.data  : null;
              const logs = logsRes.status === "fulfilled" ? (logsRes.value.data ?? []) : [];
              const tasksCompleted = logs.filter((l: { outcome?: string }) => l.outcome === "completed").length;
              const momentum = (ctx?.momentum_score as number | undefined) ?? 50;
              const streak   = (ctx?.streak as number | undefined) ?? 0;

              // Deterministic body — always references real numbers, testable, instant
              let pushBody: string;
              if (tasksCompleted === 0) {
                pushBody = "Your weekly report is ready. See what the data says about this week.";
              } else if (streak >= 7) {
                pushBody = `${tasksCompleted} tasks logged · ${streak}-day streak · Your week in full → /reports`;
              } else if (momentum >= 70) {
                pushBody = `${tasksCompleted} tasks done, momentum at ${momentum}. Strong week — see the breakdown.`;
              } else if (momentum < 45) {
                pushBody = `${tasksCompleted} tasks, momentum at ${momentum}. See what pulled it down and what's next.`;
              } else {
                pushBody = `${tasksCompleted} task${tasksCompleted !== 1 ? "s" : ""} logged this week. Your report + next move are ready.`;
              }

              await webpush.sendNotification(
                row.subscription,
                JSON.stringify({
                  title: "📋 Weekly report ready",
                  body:  pushBody,
                  icon:  "/logo/icon-192.png",
                  badge: "/logo/icon-96.png",
                  url:   "/reports",
                  tag:   "weekly-report",
                }),
              );

              // Write last_week_summary for each builder user — no AI call needed, deterministic
              try {
                const userId = row.user_id;
                const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const [reflRes, ctxRes] = await Promise.all([
                  supabase.from("reflections")
                    .select("outcome, confidence, note, what_tried, what_learned, blocker, created_at")
                    .eq("user_id", userId)
                    .gte("created_at", weekAgo)
                    .order("created_at", { ascending: false }),
                  supabase.from("founder_context")
                    .select("tasks_accepted_this_week, tasks_overridden_this_week, momentum_score")
                    .eq("user_id", userId).maybeSingle(),
                ]);

                const refs = reflRes.data ?? [];
                if (refs.length >= 2) {
                  const completedCount = refs.filter(r => r.outcome === "completed").length;
                  const blockedCount = refs.filter(r => r.outcome === "blocked").length;
                  const avgConf = refs.reduce((s, r) => s + (r.confidence ?? 3), 0) / refs.length;
                  const keyLearnings = refs.filter(r => r.what_learned).map(r => r.what_learned).join("; ") || null;
                  const topBlocker = refs.filter(r => r.blocker).map(r => r.blocker).join("; ") || null;
                  const ctx = ctxRes.data;

                  const summary = JSON.stringify({
                    tasks_completed: completedCount,
                    tasks_blocked: blockedCount,
                    avg_confidence: Math.round(avgConf * 10) / 10,
                    override_count: ctx?.tasks_overridden_this_week ?? 0,
                    biggest_blocker: topBlocker,
                    key_learnings: keyLearnings,
                    momentum_score: ctx?.momentum_score ?? null,
                    next_week_recommendation: blockedCount > completedCount
                      ? "Rebuild momentum: start with smallest-possible confidence win"
                      : "Continue current thread and go one level deeper",
                  });

                  await supabase.from("founder_memory")
                    .update({ last_week_summary: summary })
                    .eq("user_id", userId);
                }
              } catch { /* non-fatal — never blocks push delivery */ }

              pushed++;
            } catch (err: unknown) {
              if (err && typeof err === "object" && "statusCode" in err) {
                const code = (err as { statusCode: number }).statusCode;
                if (code === 410 || code === 404) {
                  await supabase
                    .from("push_subscriptions")
                    .delete()
                    .eq("user_id", row.user_id);
                }
              }
              pushErrors.push(`${row.user_id}: ${String(err).slice(0, 60)}`);
            }
          }),
        );
      }
    }
  }

  return NextResponse.json({
    success: true,
    cron: true,
    ran_at: now.toISOString(),
    users_scanned: allAuthUsers.length,
    processed: builderUsers.length,
    durationMs: Date.now() - start,
    builder_users: builderUsers.length,
    push_sent: pushed,
    push_skipped: skipped,
    push_errors: pushErrors.slice(0, 5),
  });
}
