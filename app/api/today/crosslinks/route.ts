/**
 * GET /api/today/crosslinks — the few facts the Today finish screen needs: has this founder run Break My Startup
 * or an agent mission, and what BuildMind did for them this week. Read-only; every number is counted, none estimated.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export async function GET() {
  const user = await getRouteUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = createAdminClient();
  const weekAgo = new Date(Date.now() - 7 * DAY);

  const [lastBreak, agentRuns, finished, prepared] = await Promise.all([
    admin.from("break_predictions").select("created_at").eq("user_id", user.userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    admin.from("agent_runs").select("id", { count: "exact", head: true }).eq("user_id", user.userId),
    admin.from("reflexion_learning_log").select("id", { count: "exact", head: true }).eq("user_id", user.userId).eq("outcome", "completed").gte("created_at", weekAgo.toISOString()),
    admin.from("prepared_work").select("id", { count: "exact", head: true }).eq("user_id", user.userId).gte("day", weekAgo.toISOString().slice(0, 10)),
  ]);

  const createdAt = (lastBreak.data as { created_at?: string } | null)?.created_at;
  return NextResponse.json({
    ok: true,
    breakAgeDays: createdAt ? Math.max(0, Math.floor((Date.now() - Date.parse(createdAt)) / DAY)) : null,
    hasAgentRun: (agentRuns.count ?? 0) > 0,
    week: { finished: finished.count ?? 0, prepared: prepared.count ?? 0 },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
