import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { planFromUserMetadata } from "@/lib/plan";

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

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("user_id, subscription");

  if (error) {
    return NextResponse.json({ ok: false, error: error.message, step: "fetch_subscriptions" }, { status: 500 });
  }

  const rows = subs ?? [];
  const today = new Date().toISOString().split("T")[0];
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";

  let eligible = 0;
  let skippedFree = 0;
  let skippedReflected = 0;
  let sent = 0;
  let failed = 0;
  const failedDetails: Array<{ userId: string; error: string }> = [];

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

    const { data: ctx } = await supabase
      .from("founder_context")
      .select("days_inactive")
      .eq("user_id", row.user_id)
      .maybeSingle();

    const daysInactive = Math.max(1, (ctx?.days_inactive ?? 0) + 1);
    const body = eveningNudge(daysInactive);

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

  return NextResponse.json({
    ok: true,
    cron: true,
    dryRun,
    total: rows.length,
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
