import { NextResponse } from "next/server";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { evaluateAndCacheStageTransition } from "@/lib/server/stageTransition";

/**
 * POST /api/ai/check-stage-transition
 *
 * Three-signal stage transition trigger: milestone completion + reflection
 * confidence trend + override rate. Returns shouldPrompt + nextStage if all
 * three signals align.
 *
 * CONSOLIDATION: this route used to run its own copy of the query logic
 * (project + milestones + reflections + overrides) duplicating what
 * app/api/founder-context/task-complete/route.ts's now-retired
 * checkAndCacheStageTransition() did with different thresholds — the two
 * could disagree on the same page load. Both call sites now go through
 * lib/server/stageTransition.ts's evaluateAndCacheStageTransition(), which
 * also writes founder_context.pending_stage_transition as a side effect,
 * so a project-page visit "refreshes" the same cached value Today reads,
 * rather than being a second, separate answer.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAdminEnv()) {
    return NextResponse.json({ success: true, data: { shouldPrompt: false, reason: "no_admin_env" } });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? routeUser.userId).trim();
    const projectId = String(body?.projectId ?? "").trim();

    if (userId !== routeUser.userId || !projectId) {
      return NextResponse.json({ success: false, error: "Unauthorized or missing projectId" }, { status: 401 });
    }

    const evaluation = await evaluateAndCacheStageTransition(userId, projectId);
    if (!evaluation) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: evaluation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
  }
