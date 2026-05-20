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

  if (!isCronRequest(request) && process.env.NODE_ENV === "production") {
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
              await webpush.sendNotification(
                row.subscription,
                JSON.stringify({
                  title: "📋 Your weekly startup report is ready",
                  body: "See what you built this week vs what you planned. Your Monday move is already decided.",
                  icon: "/logo/icon-192.png",
                  badge: "/logo/icon-96.png",
                  url: "/reports",
                  tag: "weekly-report",
                }),
              );
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
