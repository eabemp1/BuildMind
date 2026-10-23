/**
 * GET /api/cron/radar-discover - Radar looks for opportunities on its own, about twice a week.
 * Scheduled Tue/Wed/Fri/Sat (vercel.json); each founder is searched at most once every 2 days, opted-out
 * founders are skipped, and the run stops when its time budget is used (the next run continues).
 * Runs for paying founders only (active Builder subscription) who use Radar: those with at least one
 * Radar item or a settings row.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { runDiscovery } from "@/lib/radar/discoverRun";
import { isPaidSubscription, pickAutoRunUsers, MAX_USERS_PER_RUN, RUN_BUDGET_MS } from "@/lib/radar/autoRun";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isCron(request: Request): boolean {
  const bearer = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const given = request.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && given === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isCron(request) && process.env.NODE_ENV === "production") return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  if (!hasAdminEnv()) return NextResponse.json({ success: false, error: "Supabase admin env is missing." }, { status: 500 });
  const started = Date.now();
  const admin = createAdminClient();

  const [itemsRes, settingsRes, subsRes] = await Promise.all([
    admin.from("radar_items").select("user_id").order("created_at", { ascending: false }).limit(3000),
    admin.from("radar_settings").select("user_id, auto_discover, where_text, last_auto_run_at").limit(5000),
    admin.from("subscriptions").select("user_id, plan, status, current_period_end, grace_period_ends_at").eq("plan", "builder").limit(10000),
  ]);
  // Fail closed: if paid status cannot be read, search for nobody rather than for everybody.
  if (subsRes.error) return NextResponse.json({ success: false, error: "Could not read subscriptions." }, { status: 503 });
  const nowDate = new Date();
  const paid = new Set(((subsRes.data ?? []) as Array<{ user_id: string; plan: string; status: string; current_period_end: string | null; grace_period_ends_at: string | null }>).filter((r) => isPaidSubscription(r, nowDate)).map((r) => r.user_id));
  if (settingsRes.error) return NextResponse.json({ success: false, error: "Radar settings table is missing. Run migration 20261023020000_radar_auto.sql." }, { status: 503 });
  type S = { user_id: string; auto_discover: boolean | null; where_text: string | null; last_auto_run_at: string | null };
  const settings = new Map(((settingsRes.data ?? []) as S[]).map((s) => [s.user_id, s]));
  const ids = new Set<string>([...((itemsRes.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id), ...settings.keys()].filter((id) => paid.has(id)));
  const due = pickAutoRunUsers([...ids].map((id) => ({ user_id: id, auto_discover: settings.get(id)?.auto_discover, last_auto_run_at: settings.get(id)?.last_auto_run_at })), new Date(), MAX_USERS_PER_RUN);

  let searched = 0, withNew = 0, added = 0, failed = 0;
  for (const userId of due) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    try {
      const r = await runDiscovery(admin, { userId, projectId: null, where: settings.get(userId)?.where_text ?? "" });
      const now = new Date().toISOString();
      // The run is recorded even when it finds nothing, so a founder is not searched again for 2 days.
      await admin.from("radar_settings").upsert({
        user_id: userId, last_auto_run_at: now, updated_at: now,
        last_auto_added: r.ok ? r.added.length : 0,
        last_auto_note: r.ok ? (r.added.length ? `Found ${r.added.length}` : "Nothing new that fit") : r.error.slice(0, 200),
      }, { onConflict: "user_id" });
      if (!r.ok) { failed++; continue; }
      searched++;
      if (r.added.length) {
        withNew++; added += r.added.length;
        await admin.from("notifications").insert({
          user_id: userId, type: "radar_found", is_read: false,
          message: `Radar found ${r.added.length} new ${r.added.length === 1 ? "opportunity" : "opportunities"} that fit you: ${r.added.slice(0, 2).map((a) => a.title).join("; ")}. Check the dates on the page before you rely on them.`,
        });
      }
    } catch { failed++; }
  }
  return NextResponse.json({ success: true, paid: paid.size, due: due.length, searched, withNew, added, failed, ms: Date.now() - started });
}
