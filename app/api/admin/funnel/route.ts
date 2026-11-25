/**
 * GET /api/admin/funnel[?days=30]
 *
 * Landing visitors -> signups -> first completed task -> back within 7 days, split by source.
 * Admin only. QA accounts and QA browsers are excluded (see lib/funnel/exclude.ts). Every number is read
 * from stored data; nothing is estimated.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildFunnel, type Account, type Activity, type SignupTouch, type Visit } from "@/lib/funnel/report";
import { excludeConfigFromEnv, isQaAccount } from "@/lib/funnel/exclude";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user || !(await isAdminUser(user.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const days = Math.min(90, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  const now = new Date();
  const since = new Date(now.getTime() - days * DAY).toISOString();
  const admin = createAdminClient();

  const accounts: Account[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000, page });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const u of data.users) if (u.created_at >= since) accounts.push({ id: u.id, email: u.email ?? null, createdAt: u.created_at });
    if (data.users.length < 1000) break;
  }
  const ids = accounts.map((a) => a.id);

  const [visitRes, touchRes, adminRes, actRes] = await Promise.all([
    admin.from("funnel_events").select("session_id, meta, created_at").eq("step", "landing_view").is("user_id", null).gte("created_at", since).limit(50000),
    ids.length ? admin.from("funnel_events").select("user_id, meta, created_at").eq("step", "signup").in("user_id", ids).limit(5000) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("profiles").select("id").eq("is_admin", true).in("id", ids) : Promise.resolve({ data: [] }),
    ids.length ? admin.from("activity_log").select("user_id, event_type, occurred_at").in("user_id", ids).gte("occurred_at", since).limit(50000) : Promise.resolve({ data: [] }),
  ]);

  const visits: Visit[] = ((visitRes.data ?? []) as Array<{ session_id: string | null; meta: { source?: string } | null; created_at: string }>).map((r) => ({ vid: r.session_id, source: r.meta?.source ?? "direct", at: r.created_at }));
  const signupTouches: SignupTouch[] = ((touchRes.data ?? []) as Array<{ user_id: string; meta: { source?: string } | null; created_at: string }>).map((r) => ({ userId: r.user_id, source: r.meta?.source ?? "unknown", at: r.created_at }));
  const activity: Activity[] = ((actRes.data ?? []) as Array<{ user_id: string; event_type: string; occurred_at: string }>).map((r) => ({ userId: r.user_id, type: r.event_type, at: r.occurred_at }));
  const cfg = excludeConfigFromEnv();
  const adminDb = new Set(((adminRes.data ?? []) as Array<{ id: string }>).map((r) => r.id));

  const report = buildFunnel({ now, days, visits, accounts, signupTouches, activity, isExcluded: (a) => isQaAccount(a, cfg, adminDb) });
  return NextResponse.json({ ok: true, report, excludeListSet: cfg.emails.length > 0 });
}
