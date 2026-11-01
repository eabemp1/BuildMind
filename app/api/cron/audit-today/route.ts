/**
 * app/api/cron/audit-today/route.ts — nightly audit of the tasks Today generated in the last day.
 *
 * Checks each task against what that founder has actually written (lib/today/audit.ts) and logs findings as
 * `audit` events for the admin "Today quality" card. Deterministic: no AI call, no cost, and it never changes a task
 * or contacts anyone. Protected by CRON_SECRET. Add ?dryRun=1 to see findings without writing them.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logQualityEvent } from "@/lib/today/telemetry";
import { auditTask } from "@/lib/today/audit";
import { buildLedger, type ReflectionText } from "@/lib/today/facts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;

function isCronRequest(req: Request): boolean {
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function GET(request: Request) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const admin = createAdminClient();
  const since = new Date(Date.now() - 26 * 3600_000).toISOString();

  const { data: logs } = await admin.from("reflexion_learning_log").select("user_id, action_shown, created_at")
    .like("session_id", "today_action:%").gte("created_at", since).order("created_at", { ascending: false }).limit(600);
  const rows = ((logs ?? []) as Array<{ user_id: string | null; action_shown: string | null; created_at: string }>).filter((r) => r.user_id && r.action_shown);
  const users = Array.from(new Set(rows.map((r) => r.user_id as string)));
  if (users.length === 0) return NextResponse.json({ ok: true, audited: 0, findings: [] });

  const wide = new Date(Date.now() - 45 * DAY).toISOString();
  const [projects, reflections, already] = await Promise.all([
    admin.from("projects").select("user_id, name, title, description, problem, target_users").in("user_id", users).limit(1000),
    admin.from("reflections").select("user_id, outcome, note, what_tried, what_happened, what_learned, blocker, today_action, created_at").in("user_id", users).gte("created_at", wide).limit(6000),
    admin.from("today_quality_events").select("user_id, task").eq("kind", "audit").gte("created_at", new Date(Date.now() - 2 * DAY).toISOString()).limit(2000),
  ]);

  const text = new Map<string, string>();
  for (const p of (projects.data ?? []) as Array<Record<string, string | null> & { user_id: string }>) {
    text.set(p.user_id, `${text.get(p.user_id) ?? ""} ${[p.name, p.title, p.description, p.problem, p.target_users].filter(Boolean).join(" ")}`);
  }
  const refl = new Map<string, ReflectionText[]>();
  for (const r of (reflections.data ?? []) as Array<ReflectionText & { user_id: string }>) {
    (refl.get(r.user_id) ?? refl.set(r.user_id, []).get(r.user_id)!).push(r);
    text.set(r.user_id, `${text.get(r.user_id) ?? ""} ${[r.note, r.what_tried, r.what_happened, r.what_learned, r.blocker].filter(Boolean).join(" ")}`);
  }
  const seen = new Set(((already.data ?? []) as Array<{ user_id: string | null; task: string | null }>).map((e) => `${e.user_id}|${e.task}`));

  const findings: Array<{ task: string; rules: string[] }> = [];
  const done = new Set<string>();
  for (const r of rows) {
    const key = `${r.user_id}|${(r.action_shown as string).slice(0, 400)}`;
    if (done.has(key) || seen.has(key)) continue;
    done.add(key);
    const rules = auditTask(r.action_shown as string, text.get(r.user_id as string) ?? "", buildLedger(refl.get(r.user_id as string) ?? []));
    if (rules.length === 0) continue;
    findings.push({ task: (r.action_shown as string).slice(0, 200), rules });
    if (!dryRun) await logQualityEvent(admin, { userId: r.user_id, kind: "audit", rules, task: r.action_shown });
  }
  // Privacy: no user ids in the response.
  return NextResponse.json({ ok: true, dryRun, audited: done.size, findings });
}
