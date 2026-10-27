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
    const [tasks, radar] = await Promise.all([
      admin.from("tasks").select("completed_at").eq("user_id", user.userId).eq("is_completed", true).gte("completed_at", since).limit(500),
      admin.from("radar_items").select("updated_at").eq("user_id", user.userId).in("status", ["applied", "attending"]).gte("updated_at", new Date(now - 7 * DAY).toISOString()).limit(100),
    ]);
    if (tasks.error) return NextResponse.json({ ok: true, note: null });
    const cut = now - 7 * DAY;
    const times = (tasks.data ?? []).map((r) => Date.parse(String((r as { completed_at: string }).completed_at)));
    const note = weeklyNote({ done: times.filter((t) => t >= cut).length, prevDone: times.filter((t) => t < cut).length, radarActed: radar.error ? 0 : (radar.data ?? []).length });
    return NextResponse.json({ ok: true, note });
  } catch {
    return NextResponse.json({ ok: true, note: null });
  }
}
