/** GET /api/today/week: counts behind the weekly note. Only the signed-in founder's own rows. */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { weeklyNote } from "@/lib/weeklyNote";

export const dynamic = "force-dynamic";
const DAY = 86_400_000;

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const admin = createAdminClient();
    const now = Date.now();
    const since = new Date(now - 14 * DAY).toISOString();
    const [tasks, radar, activity] = await Promise.all([
      admin.from("tasks").select("completed_at").eq("user_id", user.userId).eq("is_completed", true).gte("completed_at", since).limit(500),
      admin.from("radar_items").select("updated_at").eq("user_id", user.userId).in("status", ["applied", "attending"]).gte("updated_at", new Date(now - 7 * DAY).toISOString()).limit(100),
      // Today's "Done" is recorded here even when the task has no row in the tasks table.
      admin.from("activity_log").select("occurred_at").eq("user_id", user.userId).eq("event_type", "task_completed").gte("occurred_at", since).limit(500),
    ]);
    if (tasks.error) return NextResponse.json({ ok: true, note: null });
    const cut = now - 7 * DAY;
    const stamps = (rows: unknown[] | null | undefined, key: string) => (rows ?? []).map((r) => Date.parse(String((r as Record<string, string>)[key])));
    const fromTasks = stamps(tasks.data, "completed_at");
    const fromLog = activity.error ? [] : stamps(activity.data, "occurred_at");
    // The same completion can appear in both places, so use whichever source saw more.
    const count = (a: number[], inWeek: boolean) => a.filter((t) => (t >= cut) === inWeek).length;
    const done = Math.max(count(fromTasks, true), count(fromLog, true));
    const prevDone = Math.max(count(fromTasks, false), count(fromLog, false));
    const note = weeklyNote({ done, prevDone, radarActed: radar.error ? 0 : (radar.data ?? []).length });
    return NextResponse.json({ ok: true, note });
  } catch {
    return NextResponse.json({ ok: true, note: null });
  }
}
