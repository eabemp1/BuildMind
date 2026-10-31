/**
 * GET /api/admin/new-founders[?days=7]
 *
 * What did each new founder actually get? For accounts whose first project was created in the last N days:
 * their stage, whether they said who they build for, and their first three Today tasks with the outcome.
 * No emails or ids leave the server; a founder is shown as "Founder 1", "Founder 2".
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { isAdminUser } from "@/lib/server/adminAuth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DAY = 86_400_000;

export async function GET(request: Request) {
  const user = await getRouteUser();
  if (!user || !(await isAdminUser(user.userId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const days = Math.min(30, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 7));
  const since = new Date(Date.now() - days * DAY).toISOString();
  const admin = createAdminClient();

  const { data: projects } = await admin
    .from("projects")
    .select("user_id, name, title, startup_stage, target_users, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(300);

  const firstByUser = new Map<string, NonNullable<typeof projects>[number]>();
  for (const p of projects ?? []) if (p.user_id && !firstByUser.has(p.user_id)) firstByUser.set(p.user_id, p);
  const users = [...firstByUser.keys()];
  if (users.length === 0) return NextResponse.json({ days, founders: [] });

  const [logs, events] = await Promise.all([
    admin.from("reflexion_learning_log").select("user_id, action_shown, outcome, created_at")
      .in("user_id", users).like("session_id", "today_action:%").gte("created_at", since).order("created_at", { ascending: true }).limit(2000),
    admin.from("today_quality_events").select("user_id, task, rules, created_at")
      .in("user_id", users).eq("kind", "fallback").gte("created_at", since).limit(2000),
  ]);

  const curated = new Set<string>();
  for (const e of (events.data ?? []) as Array<{ user_id: string; task: string | null; rules: string[] | null }>) {
    if ((e.rules ?? []).includes("first_run_curated") && e.task) curated.add(`${e.user_id}|${e.task.slice(0, 80)}`);
  }
  const tasksBy = new Map<string, Array<{ task: string; outcome: string | null; curated: boolean }>>();
  for (const r of (logs.data ?? []) as Array<{ user_id: string; action_shown: string | null; outcome: string | null }>) {
    if (!r.action_shown) continue;
    const list = tasksBy.get(r.user_id) ?? [];
    if (list.length >= 3 || list.some((t) => t.task === r.action_shown)) continue;
    list.push({ task: r.action_shown, outcome: r.outcome, curated: curated.has(`${r.user_id}|${r.action_shown.slice(0, 80)}`) });
    tasksBy.set(r.user_id, list);
  }

  const founders = users.map((id, i) => {
    const p = firstByUser.get(id)!;
    const tasks = tasksBy.get(id) ?? [];
    return {
      label: `Founder ${i + 1}`,
      project: (p.name ?? p.title ?? "") as string,
      stage: p.startup_stage ?? null,
      saidWhoFor: Boolean((p.target_users ?? "").trim()),
      daysSince: Math.floor((Date.now() - Date.parse(p.created_at as string)) / DAY),
      finished: tasks.filter((t) => t.outcome === "completed").length,
      tasks,
    };
  }).sort((a, b) => a.daysSince - b.daysSince);

  return NextResponse.json({ days, founders });
}
