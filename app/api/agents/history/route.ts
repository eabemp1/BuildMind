/**
 * GET /api/agents/history?projectId=…
 * The founder's recent agent runs (newest first) for one project, with the
 * review state of each run's findings so the workspace can show an honest
 * case archive and per-agent track record. Owner-scoped.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getRouteUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const projectId = new URL(request.url).searchParams.get("projectId");
  const admin = createAdminClient();
  let q = admin.from("agent_runs")
    .select("id,agent_type,status,mission,iteration,max_iterations,signals_found,confidence_pct,verdict,top_finding_1,top_finding_2,top_finding_3,top_risk,recommended_action,report_markdown,started_at,completed_at,current_action")
    .eq("user_id", auth.userId).order("started_at", { ascending: false }).limit(30);
  if (projectId) q = q.eq("project_id", projectId);
  const { data: runs, error } = await q;
  if (error) return NextResponse.json({ ok: true, runs: [], findings: [] });
  const ids = (runs ?? []).map((r: { id: string }) => r.id);
  let findings: unknown[] = [];
  if (ids.length) {
    const { data } = await admin.from("agent_findings")
      .select("id,run_id,iteration,signal_type,positive,confidence,founder_confirmed").in("run_id", ids).limit(1500);
    findings = data ?? [];
  }
  return NextResponse.json({ ok: true, runs: runs ?? [], findings }, { headers: { "Cache-Control": "private, no-store" } });
}
