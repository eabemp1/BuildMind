/**
 * GET /api/agents/findings/[runId]
 *
 * Returns all findings for a run, split into:
 *   pending   — founder_confirmed IS NULL
 *   confirmed — founder_confirmed = true
 *   rejected  — founder_confirmed = false
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const auth = await getRouteUser();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  if (!runId) {
    return NextResponse.json({ ok: false, error: "Missing runId" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify run ownership first
  const { data: run } = await admin
    .from("agent_runs")
    .select("id")
    .eq("id", runId)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
  }

  const { data: allFindings, error } = await admin
    .from("agent_findings")
    .select("id,iteration,signal_type,positive,confidence,title,evidence,action_hint,founder_confirmed")
    .eq("run_id", runId)
    .order("iteration", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "Failed to load findings." }, { status: 500 });
  }

  const findings = allFindings ?? [];

  return NextResponse.json({
    ok:   true,
    data: {
      pending:   findings.filter(f => f.founder_confirmed === null),
      confirmed: findings.filter(f => f.founder_confirmed === true),
      rejected:  findings.filter(f => f.founder_confirmed === false),
    },
  });
}
