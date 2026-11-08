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
import { pickWhyNow, whyNowHref } from "@/lib/today/whyNow";

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
    // Soonest open milestone with a date, for the project the founder works on most recently.
    let milestone: { title: string; days: number } | null = null;
    try {
      const { data: proj } = await admin.from("projects").select("id").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (proj?.id) {
        const { data: ms } = await admin.from("milestones").select("title, target_date").eq("project_id", proj.id).neq("status", "completed").not("target_date", "is", null).order("target_date", { ascending: true }).limit(1);
        const m = (ms ?? [])[0] as { title: string; target_date: string } | undefined;
        const t = m ? Date.parse(`${String(m.target_date).slice(0, 10)}T00:00:00Z`) : NaN;
        if (m && Number.isFinite(t)) milestone = { title: m.title, days: Math.ceil((t - now) / DAY) };
      }
    } catch { /* no milestone line */ }
    const rows = recent.error ? [] : (recent.data ?? []) as Array<{ status: string }>;
    const fresh = watch && !watch.baseline && Date.parse(watch.weekStart) >= now - 8 * DAY;
    const facts = {
      waiting: waiting.error ? 0 : waiting.count ?? 0,
      sentRecent: rows.length,
      repliedRecent: rows.filter((r) => ["replied", "booked", "done"].includes(r.status)).length,
      marketChanges: fresh ? watch!.changes.length : 0,
      milestone,
    };
    const line = pickWhyNow(facts);
    return NextResponse.json({ ok: true, line, href: line ? whyNowHref(facts) : null }, { headers: H });
  } catch {
    return NextResponse.json({ ok: true, line: null }, { headers: H });
  }
}
