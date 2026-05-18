import { NextResponse } from "next/server";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { shouldPromptStageTransition, STAGE_ORDER, normalizeStage } from "@/lib/stages";

/**
 * POST /api/ai/check-stage-transition
 *
 * From verbal transcript: three-signal stage transition trigger.
 * Checks: milestone completion + reflection confidence + consecutive completions.
 * Returns shouldPrompt + nextStage if all three signals align.
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

    const supabase = createAdminClient();

    // 1. Get project + milestones for current stage
    const { data: project } = await supabase
      .from("projects")
      .select("startup_stage, name, title")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (!project) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const currentStage = normalizeStage(project.startup_stage);
    const currentStageIdx = STAGE_ORDER.indexOf(currentStage);
    const nextStage = currentStageIdx < STAGE_ORDER.length - 1
      ? STAGE_ORDER[currentStageIdx + 1]
      : null;

    // Get milestones for current stage
    const { data: milestones } = await supabase
      .from("milestones")
      .select("id, title, status, order_index")
      .eq("project_id", projectId)
      .eq("user_id", userId);

    const stageMilestones = (milestones ?? []).filter(m =>
      normalizeStage(m.title) === currentStage || m.title?.toLowerCase().includes(currentStage.toLowerCase())
    );
    const stageMilestonesComplete = stageMilestones.length > 0
      ? stageMilestones.every(m => m.status === "completed")
      : false;

    // 2. Get recent reflections (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: reflections } = await supabase
      .from("reflections")
      .select("confidence, outcome")
      .eq("user_id", userId)
      .gte("created_at", sevenDaysAgo)
      .order("created_at", { ascending: false })
      .limit(10);

    // 3. Count overrides/skips in last 7 days
    const { count: overrideCount } = await supabase
      .from("reflections")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("outcome", ["skipped", "overridden", "blocked"])
      .gte("created_at", sevenDaysAgo);

    const result = shouldPromptStageTransition({
      stageMilestonesComplete,
      recentReflections: (reflections ?? []).map(r => ({ confidence: r.confidence ?? 3 })),
      recentOverrides: overrideCount ?? 0,
    });

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        currentStage,
        nextStage,
        stageMilestonesComplete,
        reflectionCount: (reflections ?? []).length,
        avgConfidence: (reflections ?? []).length > 0
          ? Math.round(
              ((reflections ?? []).reduce((s, r) => s + (r.confidence ?? 3), 0) / (reflections ?? []).length) * 10
            ) / 10
          : null,
        overrides: overrideCount ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
