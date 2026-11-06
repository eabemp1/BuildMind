/**
 * GET /api/today/why-now — the single line under today's task saying why it matters now.
 * Read-only. Counts the founder's own people and the latest saved Market Watch scan; estimates nothing.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { FOLLOW_UP_AFTER_DAYS } from "@/lib/conversations/track";
import { loadLatestWatch } from "@/lib/server/marketWatch";
import { pickWhyNow } from "@/lib/today/whyNow";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;
const H = { "Cache-Control": "private, no-store" };

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ ok: true, line: null }, { headers: H });
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const cutoff = new Date(now - FOLLOW_UP_AFTER_DAYS * DAY).toISOString();
    const [waiting, recent, watch] = await Promise.all([
      admin.from("conversation_people").select("id", { count: "exact", head: true }).eq("user_id", user.userId).eq("status", "sent").lte("contacted_at", cutoff),
      admin.from("conversation_people").select("status").eq("user_id", user.userId).neq("status", "to_contact").gte("contacted_at", cutoff).limit(200),
      loadLatestWatch(admin, user.userId, null),
    ]);
    const rows = recent.error ? [] : (recent.data ?? []) as Array<{ status: string }>;
    const fresh = watch && !watch.baseline && Date.parse(watch.weekStart) >= now - 8 * DAY;
    const line = pickWhyNow({
      waiting: waiting.error ? 0 : waiting.count ?? 0,
      sentRecent: rows.length,
      repliedRecent: rows.filter((r) => ["replied", "booked", "done"].includes(r.status)).length,
      marketChanges: fresh ? watch!.changes.length : 0,
    });
    return NextResponse.json({ ok: true, line }, { headers: H });
  } catch {
    return NextResponse.json({ ok: true, line: null }, { headers: H });
  }
}
