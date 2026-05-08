import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let vapidConfigured = false;

function configureVapidDetails(): void {
  if (vapidConfigured) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:hello@buildmind.live",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  vapidConfigured = true;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const missing = [
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? null : "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    process.env.VAPID_PRIVATE_KEY ? null : "VAPID_PRIVATE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY ? null : "SUPABASE_SERVICE_ROLE_KEY",
  ].filter(Boolean);

  if (missing.length > 0) {
    return NextResponse.json(
      { ok: false, error: "Push test is missing required environment variables.", missing },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const { data: row, error: subError } = await admin
    .from("push_subscriptions")
    .select("subscription")
    .eq("user_id", user.id)
    .maybeSingle();

  if (subError) {
    return NextResponse.json({ ok: false, error: subError.message }, { status: 500 });
  }

  if (!row?.subscription) {
    return NextResponse.json(
      { ok: false, error: "No push subscription found for this user. Enable notifications in Settings first." },
      { status: 404 },
    );
  }

  configureVapidDetails();

  const payload = JSON.stringify({
    title: "BuildMind test notification",
    body: "Push is working. The daily cron can use this same subscription.",
    icon: "/logo/icon-192.png",
    badge: "/logo/icon-96.png",
    url: "/today",
    tag: "buildmind-test",
  });

  try {
    await webpush.sendNotification(row.subscription, payload);
    return NextResponse.json({ ok: true, sent: 1 });
  } catch (err: unknown) {
    const statusCode = err && typeof err === "object" && "statusCode" in err
      ? Number((err as { statusCode: number }).statusCode)
      : null;

    if (statusCode === 404 || statusCode === 410) {
      await admin.from("push_subscriptions").delete().eq("user_id", user.id);
    }

    return NextResponse.json(
      { ok: false, error: String(err), statusCode },
      { status: statusCode === 404 || statusCode === 410 ? 410 : 500 },
    );
  }
}
