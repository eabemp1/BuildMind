import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildDigest, notifyOwner } from "@/lib/ownerNotify";

/** GET /api/cron/owner-digest — daily 20:00 UTC. One quiet summary; silent on empty days. */
export async function GET(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = request.headers.get("x-cron-secret") ?? bearer;
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [signups, upgrades, incidents, total] = await Promise.all([
    admin.from("owner_events").select("id", { count: "exact", head: true }).eq("kind", "signup").gte("created_at", since),
    admin.from("owner_events").select("id", { count: "exact", head: true }).eq("kind", "upgrade").gte("created_at", since),
    admin.from("status_checks").select("id", { count: "exact", head: true }).eq("overall", "down").gte("checked_at", since),
    admin.from("profiles").select("id", { count: "exact", head: true }),
  ]);
  const msg = buildDigest({
    signups: signups.count ?? 0,
    upgrades: upgrades.count ?? 0,
    incidents: incidents.count ?? 0,
    totalUsers: total.count ?? 0,
  });
  if (!msg) return NextResponse.json({ ok: true, sent: false });
  const channels = await notifyOwner(msg);
  return NextResponse.json({ ok: true, sent: true, channels });
}
