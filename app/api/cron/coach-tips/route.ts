/**
 * app/api/cron/coach-tips/route.ts
 *
 * Sends the "AI Coach Tips" notification, only to people who switched it on
 * in Settings. Runs twice a week (vercel.json), so at most 2 tips a week.
 * Each tip comes from pickCoachTip() using the founder's real numbers; when
 * nothing worth saying exists, nothing is sent.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { claimSendSlots } from "@/lib/cronSendLog";
import { getFounderSnapshot } from "@/lib/server/founderSnapshot";
import { pickCoachTip } from "@/lib/coachTips";
import { NOTIFICATION_PREFS_KEY } from "@/lib/notificationPrefs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isCron(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = request.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && given === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isCron(request) && process.env.NODE_ENV === "production") {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAdminEnv()) return NextResponse.json({ success: false, error: "Supabase admin env is missing." }, { status: 500 });

  const admin = createAdminClient();
  const MAX_USERS = 500;

  const { data: prefRows, error } = await admin
    .from("user_behavior_state")
    .select("user_id, value")
    .eq("key", NOTIFICATION_PREFS_KEY)
    .limit(5000);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const optedIn = (prefRows ?? [])
    .filter((r: { value: unknown }) => (r.value as { coachTips?: unknown } | null)?.coachTips === true)
    .map((r: { user_id: string }) => r.user_id)
    .slice(0, MAX_USERS);

  if (optedIn.length === 0) return NextResponse.json({ success: true, optedIn: 0, sent: 0 });

  const claimed = await claimSendSlots(optedIn, "coach_tip");
  let sent = 0;
  let noTip = 0;

  const hasVapid = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const webpush = hasVapid ? (await import("web-push")).default : null;
  if (webpush) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!,
    );
  }

  for (const userId of claimed) {
    try {
      const tip = pickCoachTip(await getFounderSnapshot(userId));
      if (!tip) { noTip++; continue; }

      await admin.from("notifications").insert({
        user_id: userId, type: "coach_tip", message: `${tip.title}. ${tip.body}`, is_read: false,
      });

      if (webpush) {
        const { data: subs } = await admin.from("push_subscriptions").select("subscription").eq("user_id", userId);
        for (const row of subs ?? []) {
          try {
            await webpush.sendNotification(
              row.subscription,
              JSON.stringify({ title: tip.title, body: tip.body, icon: "/logo/icon-192.png", badge: "/logo/icon-96.png", url: tip.url, tag: "coach-tip" }),
            );
          } catch (err) {
            const code = (err as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("user_id", userId);
          }
        }
      }
      sent++;
    } catch (err) {
      console.error("[coach-tips] failed for user", userId, err);
    }
  }

  return NextResponse.json({ success: true, optedIn: optedIn.length, claimed: claimed.length, sent, noTip });
}
