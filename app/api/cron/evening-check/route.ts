import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { planFromUserMetadata } from "@/lib/plan";
import { enqueueBatch } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

let vapidConfigured = false;

function configureVapidDetails() {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

function eveningNudge(daysInactive: number): string {
  if (daysInactive >= 3) {
    return "No pressure. Just log one honest reflection and reset tomorrow.";
  }
  if (daysInactive >= 1) {
    return "Still building today? Log what happened before the day closes.";
  }
  return "Did you make progress today? Log it so tomorrow's action gets sharper.";
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req) && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Unauthorized", hint: "Vercel Cron must send Authorization: Bearer <CRON_SECRET>." },
      { status: 401 },
    );
  }

  const envStatus = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    serviceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    vapidPublic: Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    vapidPrivate: Boolean(process.env.VAPID_PRIVATE_KEY),
    cronSecret: Boolean(process.env.CRON_SECRET),
  };
  const missing = Object.entries(envStatus).filter(([, ok]) => !ok).map(([key]) => key);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, error: "Evening cron is missing required environment variables.", missing, envStatus }, { status: 500 });
  }

  configureVapidDetails();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const today = new Date().toISOString().split("T")[0];
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  let eligible = 0;
  let skippedFree = 0;
  let skippedReflected = 0;
  let sent = 0;
  let failed = 0;
  const failedDetails: Array<{ userId: string; error: string }> = [];

  // Cursor-paginated fetch — prevents OOM crash at scale.
  // At >500 users: set QSTASH_TOKEN to fan jobs out via the queue (lib/queue/index.ts).
  // Without QSTASH_TOKEN: runs inline (current behaviour, safe up to ~500 users).
  const PAGE_SIZE = 100;
  let pageFrom = 0;
  let hasMore = true;
  let totalRows = 0;
  const allUserIds: string[] = [];

  // First pass: collect all user IDs (pagination stays fast — no AI calls here)
  while (hasMore) {
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, subscription")
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, step: "fetch_subscriptions" }, { status: 500 });
    }

    const rows = subs ?? [];
    totalRows += rows.length;
    rows.forEach(r => allUserIds.push(r.user_id));
    hasMore = rows.length === PAGE_SIZE;
    pageFrom += PAGE_SIZE;
  }

  // If QStash is configured, fan out to per-user worker endpoints and return early.
  // This keeps the orchestrator function fast and lets each worker run within its own timeout.
  if (process.env.QSTASH_TOKEN && allUserIds.length > 0) {
    try {
      await enqueueBatch("evening-check", allUserIds.map(userId => ({ userId })));
      return NextResponse.json({ ok: true, queued: allUserIds.length, mode: "queue" });
    } catch (queueErr) {
      console.error("[evening-check] QStash enqueue failed, falling back to inline:", queueErr);
      // Fall through to inline processing
    }
  }

  // Inline processing path (no QStash, or QStash unavailable)
  let pageFrom2 = 0;
  hasMore = true;

  while (hasMore) {
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("user_id, subscription")
      .range(pageFrom2, pageFrom2 + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message, step: "fetch_subscriptions" }, { status: 500 });
    }

    const rows = subs ?? [];
    hasMore = rows.length === PAGE_SIZE;
    pageFrom2 += PAGE_SIZE;

  for (const row of rows) {
    const { data: authUser } = await supabase.auth.admin.getUserById(row.user_id);
    const plan = planFromUserMetadata(authUser.user);
    if (plan !== "builder") {
      skippedFree += 1;
      continue;
    }

    eligible += 1;

    const { data: reflectedToday } = await supabase
      .from("reflections")
      .select("id")
      .eq("user_id", row.user_id)
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1)
      .maybeSingle();

    if (reflectedToday) {
      skippedReflected += 1;
      await supabase.from("founder_context").update({ days_inactive: 0 }).eq("user_id", row.user_id);
      continue;
    }

    // Fetch context + memory in parallel for pattern detection (Playbook §3.2)
    const eveningFourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [ctxResult, memoryResult, recentTasksResult] = await Promise.allSettled([
      supabase
        .from("founder_context")
        .select("days_inactive, momentum_score, momentum_last_week, tasks_accepted_this_week, tasks_overridden_this_week, override_reasons, topics_mentioned_repeatedly, last_pattern_shown_at")
        .eq("user_id", row.user_id)
        .maybeSingle(),
      supabase
        .from("founder_memory")
        .select("avoidance_zones")
        .eq("user_id", row.user_id)
        .maybeSingle(),
      supabase
        .from("reflections")
        .select("today_action")
        .eq("user_id", row.user_id)
        .gte("created_at", eveningFourteenDaysAgo)
        .not("today_action", "is", null)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

    const ctx = ctxResult.status === "fulfilled" ? ctxResult.value.data : null;
    const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
    const recentTaskTitles = recentTasksResult.status === "fulfilled"
      ? (recentTasksResult.value.data ?? []).map((r: { today_action: string }) => r.today_action).filter(Boolean)
      : [];
    const daysInactive = Math.max(1, (ctx?.days_inactive ?? 0) + 1);

    // Pattern Detection — Playbook §3.2: fires automatically every evening
    const { detectPattern, shouldSurfacePattern } = await import("@/lib/patternDetection");
    const pattern = detectPattern({
      avoidance_zones: (memory?.avoidance_zones ?? []) as string[],
      override_reasons: (ctx?.override_reasons ?? []) as string[],
      tasks_overridden_this_week: ctx?.tasks_overridden_this_week ?? 0,
      tasks_accepted_this_week: ctx?.tasks_accepted_this_week ?? 0,
      momentum_score: ctx?.momentum_score ?? 50,
      momentum_last_week: ctx?.momentum_last_week ?? null,
      topics_mentioned_repeatedly: (ctx?.topics_mentioned_repeatedly ?? []) as string[],
      days_inactive: daysInactive,
      recent_task_titles: recentTaskTitles,
    });
    const usePattern = pattern.signal && shouldSurfacePattern(ctx?.last_pattern_shown_at, pattern.severity);

    let body: string;
    if (usePattern) {
      body = pattern.message;
      // Persist so we do not repeat tomorrow
      await supabase.from("founder_context").update({
        active_pattern_signal: pattern.signal,
        active_pattern_message: pattern.message,
        last_pattern_shown_at: new Date().toISOString(),
      }).eq("user_id", row.user_id);
    } else {
      body = eveningNudge(daysInactive);
    }

    if (dryRun) continue;

    try {
      await webpush.sendNotification(row.subscription, JSON.stringify({
        title: "BuildMind check-in",
        body,
        icon: "/logo/icon-192.png",
        badge: "/logo/icon-96.png",
        url: "/reflect",
        tag: "evening-check",
      }));

      await supabase.from("notifications").insert({
        user_id: row.user_id,
        type: "evening_check",
        message: body,
        is_read: false,
      });

      await supabase.from("evening_checks").insert({
        user_id: row.user_id,
        task_completed: false,
        nudge_sent: true,
        nudge_text: body,
      });

      await supabase
        .from("founder_context")
        .update({ days_inactive: daysInactive })
        .eq("user_id", row.user_id);

      sent += 1;
    } catch (err) {
      failed += 1;
      failedDetails.push({ userId: row.user_id, error: err instanceof Error ? err.message : String(err) });
      if (err && typeof err === "object" && "statusCode" in err) {
        const statusCode = (err as { statusCode: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("user_id", row.user_id);
        }
      }
    }
  }

  } // end while (pagination)

  return NextResponse.json({
    ok: true,
    cron: true,
    dryRun,
    total: totalRows,
    eligible,
    skippedFree,
    skippedReflected,
    sent,
    failed,
    failedDetails: failedDetails.slice(0, 5),
  });
}

export async function POST(req: NextRequest) {
  return GET(req);
}
