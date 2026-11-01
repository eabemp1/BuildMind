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
import { founderStatus } from "@/lib/admin/founderStatus";

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
    admin.from("today_quality_events").select("user_id, rules, created_at")
      .in("user_id", users).eq("kind", "fallback").gte("created_at", since).limit(2000),
  ]);

  // The quality event's `task` is the AI task that was REJECTED, not the one shown, so a shown task is marked curated
  // when a first_run_curated event for the same founder was logged within two minutes of it.
  const curatedAt = new Map<string, number[]>();
  for (const e of (events.data ?? []) as Array<{ user_id: string; rules: string[] | null; created_at: string }>) {
    if (!(e.rules ?? []).includes("first_run_curated")) continue;
    const list = curatedAt.get(e.user_id) ?? [];
    list.push(Date.parse(e.created_at)); curatedAt.set(e.user_id, list);
  }
  const isCurated = (userId: string, at: string) => (curatedAt.get(userId) ?? []).some((t) => Math.abs(t - Date.parse(at)) <= 120_000);
  const tasksBy = new Map<string, Array<{ task: string; outcome: string | null; curated: boolean }>>();
  const daysSeen = new Map<string, Set<string>>();
  const lastSeen = new Map<string, number>();
  for (const r of (logs.data ?? []) as Array<{ user_id: string; action_shown: string | null; outcome: string | null; created_at: string }>) {
    const set = daysSeen.get(r.user_id) ?? new Set<string>();
    set.add(String(r.created_at).slice(0, 10)); daysSeen.set(r.user_id, set);
    lastSeen.set(r.user_id, Math.max(lastSeen.get(r.user_id) ?? 0, Date.parse(r.created_at)));
    if (!r.action_shown) continue;
    const list = tasksBy.get(r.user_id) ?? [];
    if (list.length >= 3 || list.some((t) => t.task === r.action_shown)) continue;
    list.push({ task: r.action_shown, outcome: r.outcome, curated: isCurated(r.user_id, r.created_at) });
    tasksBy.set(r.user_id, list);
  }

  const founders = users.map((id, i) => {
    const p = firstByUser.get(id)!;
    const tasks = tasksBy.get(id) ?? [];
    const finished = tasks.filter((t) => t.outcome === "completed").length;
    const daysSince = Math.floor((Date.now() - Date.parse(p.created_at as string)) / DAY);
    const seenAt = lastSeen.get(id);
    const lastSeenDays = seenAt ? Math.floor((Date.now() - seenAt) / DAY) : null;
    const activeDays = daysSeen.get(id)?.size ?? 0;
    return {
      status: founderStatus({ daysSince, finished, activeDays, lastSeenDays }),
      activeDays, lastSeenDays,
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
