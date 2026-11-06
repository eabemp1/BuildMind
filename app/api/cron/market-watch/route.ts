/**
 * GET /api/cron/market-watch - weekly Market Watch for paying founders (Monday, vercel.json).
 * Each founder's most recent project that has a Break My Startup run is scanned once per week; the run
 * stops when its time budget is used and the next day's retry is a no-op for anyone already scanned.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { isPaidSubscription } from "@/lib/radar/autoRun";
import { runMarketWatch } from "@/lib/server/marketWatch";
import { weekStartOf } from "@/lib/marketWatch/diff";
import { marketWatchMessage } from "@/lib/notifyCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_USERS = 20;
const BUDGET_MS = 100_000;

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
  const now = new Date();
  const week = weekStartOf(now);

  const subs = await admin.from("subscriptions").select("user_id, plan, status, current_period_end, grace_period_ends_at").eq("plan", "builder").limit(10000);
  // Fail closed: if paid status cannot be read, scan nobody.
  if (subs.error) return NextResponse.json({ success: false, error: "Could not read subscriptions." }, { status: 503 });
  const paid = ((subs.data ?? []) as Array<{ user_id: string; plan: string; status: string; current_period_end: string | null; grace_period_ends_at: string | null }>).filter((r) => isPaidSubscription(r, now)).map((r) => r.user_id);
  if (!paid.length) return NextResponse.json({ success: true, paid: 0, scanned: 0 });

  const [runs, done] = await Promise.all([
    admin.from("break_runs").select("user_id, project_id, created_at").in("user_id", paid).order("created_at", { ascending: false }).limit(5000),
    admin.from("market_watch_snapshots").select("user_id").eq("week_start", week).in("user_id", paid).limit(5000),
  ]);
  if (runs.error) return NextResponse.json({ success: false, error: "Could not read Break My Startup runs." }, { status: 503 });
  const scanned = new Set(((done.data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const latest = new Map<string, string | null>();
  for (const r of (runs.data ?? []) as Array<{ user_id: string; project_id: string | null }>) if (!latest.has(r.user_id) && !scanned.has(r.user_id)) latest.set(r.user_id, r.project_id);

  let ok = 0, withChanges = 0, failed = 0;
  for (const [userId, projectId] of [...latest].slice(0, MAX_USERS)) {
    if (Date.now() - started > BUDGET_MS) break;
    const out = await runMarketWatch(admin, { userId, projectId, now });
    if (!out.ok) { if (out.reason === "failed") failed++; continue; }
    ok++;
    if (out.changes.length) {
      withChanges++;
      await admin.from("notifications").insert({
        user_id: userId, type: "market_watch", is_read: false,
        message: marketWatchMessage(out.changes),
      });
    }
  }
  return NextResponse.json({ success: true, paid: paid.length, scanned: ok, withChanges, failed, ms: Date.now() - started });
}
