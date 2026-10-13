/**
 * GET /api/visuals?kind=progress|execution&projectId=…
 *
 * Returns a VisualSpec for the signed-in founder by running the same coach
 * action the AI Coach uses, so a chart on a page and a chart drawn in chat are
 * the same computation with the same plan gating.
 */
import { NextResponse } from "next/server";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { createAdminClient } from "@/lib/supabase/admin";
import { runCoachAction } from "@/lib/coachActions/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const u = await getRouteUser();
  if (!u) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind");
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  if (!projectId) return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  const id = kind === "execution" ? "draw_execution_intelligence" : kind === "progress" ? "draw_progress" : null;
  if (!id) return NextResponse.json({ success: false, error: "kind must be progress or execution" }, { status: 400 });
  const out = await runCoachAction({ id, params: {} }, { userId: u.userId, projectId, admin: createAdminClient() }, u.plan);
  if (!out.ok) return NextResponse.json({ success: false, error: out.error, status: out.status }, { status: out.status });
  return NextResponse.json({ success: true, result: out.result }, { headers: { "Cache-Control": "private, no-store" } });
}
