/**
 * GET /api/cron/loops-due — daily reminder for follow-ups the founder asked for.
 *
 * Creates one in-app notification (and a web push when configured) per founder
 * with a due follow-up, once per loop (notified_at). The Today page ALSO shows
 * due follow-ups on load, so a reminder is never the only way back in.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isCron(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = request.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && given === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isCron(request) && process.env.NODE_ENV === "production") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: false, error: "Supabase admin env is missing." }, { status: 500 });

  const admin = createAdminClient();
  const { data: loops, error } = await admin
    .from("today_loops").select("id, user_id, task_text, measure")
    .eq("status", "open").is("notified_at", null).lte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true }).limit(400);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!loops?.length) return NextResponse.json({ ok: true, due: 0, notified: 0 });

  const byUser = new Map<string, typeof loops>();
  for (const l of loops) byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);

  const hasVapid = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const webpush = hasVapid ? (await import("web-push")).default : null;
  if (webpush) webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);

  let notified = 0;
  for (const [userId, list] of byUser) {
    try {
      const first = list[0];
      const title = list.length === 1 ? "Time to record a result" : `${list.length} results to record`;
      const body = list.length === 1
        ? `You asked to check back: ${first.task_text.slice(0, 90)}. What happened?`
        : `${first.task_text.slice(0, 70)} and ${list.length - 1} more are ready for a result.`;
      await admin.from("notifications").insert({ user_id: userId, type: "loop_due", message: `${title}. ${body}`, is_read: false });
      await admin.from("today_loops").update({ notified_at: new Date().toISOString() }).in("id", list.map((l) => l.id));
      if (webpush) {
        const { data: subs } = await admin.from("push_subscriptions").select("subscription").eq("user_id", userId);
        for (const row of subs ?? []) {
          try {
            await webpush.sendNotification(row.subscription, JSON.stringify({ title, body, icon: "/logo/icon-192.png", badge: "/logo/icon-96.png", url: "/today", tag: "loop-due" }));
          } catch (err) {
            const code = (err as { statusCode?: number })?.statusCode;
            if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("user_id", userId);
          }
        }
      }
      notified++;
    } catch (err) {
      console.error("[loops-due] failed for user", userId, err);
    }
  }
  return NextResponse.json({ ok: true, due: loops.length, notified });
}
