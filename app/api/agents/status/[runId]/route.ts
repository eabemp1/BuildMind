/**
 * GET /api/agents/status/[runId]
 *
 * Returns the current state of an agent run for polling.
 * Also returns pendingReview count (findings not yet confirmed/rejected).
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

  const { data: run, error } = await admin
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .eq("user_id", auth.userId)  // enforce ownership
    .maybeSingle();

  if (error || !run) {
    return NextResponse.json({ ok: false, error: "Run not found." }, { status: 404 });
  }

  // Count pending findings (founder hasn't reviewed yet)
  const { count: pendingReview } = await admin
    .from("agent_findings")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .is("founder_confirmed", null);

  return NextResponse.json({
    ok:            true,
    data:          run,
    pendingReview: pendingReview ?? 0,
  });
}
