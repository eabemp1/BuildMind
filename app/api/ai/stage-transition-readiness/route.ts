import { NextResponse } from "next/server";
import { hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { shouldPromptStageTransition, STAGE_ORDER, normalizeStage } from "@/lib/stages";

/**
 * GET /api/ai/stage-transition-readiness?projectId=xxx
 *
 * Checks the three-signal stage transition trigger (from verbal transcript):
 *   1. All stage milestones complete
 *   2. Average reflection confidence > 3.5 over last 3+ reflections
 *   3. Fewer than 2 overrides/skips in the last 7 days
 *
 * When all three align, returns shouldPrompt: true and the transition message.
 * Called from the project page on load — non-blocking, fires in background.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAdminEnv()) {
    return NextResponse.json({ success: false, error: "Admin not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId") ?? "";
  const userId = routeUser.userId;

  if (!projectId) {
    return NextResponse.json({ success: false, error: "projectId required" }, { status: 400 });
  }

  try {
    const supabase = createAdminClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    // Fetch project, milestones, reflections, and override count in parallel
    const [projectResult, milestonesResult, reflectionsResult, overridesResult] =
      await Promise.allSettled([
        supabase
          .from("projects")
          .select("startup_stage, title")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single(),
        supabase
          .from("milestones")
          .select("id, title, status, is_completed")
          .eq("project_id", projectId)
          .eq("user_id", userId),
        supabase
          .from("reflections")
          .select("confidence, outcome")
          .eq("user_id", userId)
          .gte("created_at", sevenDaysAgo)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("reflections")
          .select("id", { count: "exact" })
          .eq("user_id", userId)
          .in("outcome", ["blocked", "skipped", "overridden"])
          .gte("created_at", sevenDaysAgo),
      ]);

    if (projectResult.status !== "fulfilled" || !projectResult.value.data) {
      return NextResponse.json({ success: false, error: "Project not found" }, { status: 404 });
    }

    const project = projectResult.value.data;
    const milestones = milestonesResult.status === "fulfilled"
      ? (milestonesResult.value.data ?? [])
      : [];
    const reflections = reflectionsResult.status === "fulfilled"
      ? (reflectionsResult.value.data ?? [])
      : [];
    const overrideCount = overridesResult.status === "fulfilled"
      ? (overridesResult.value.count ?? 0)
      : 0;

    // Check if all stage milestones are complete
    // Stage milestones = milestones whose title aligns with the current stage
    const currentStage = normalizeStage(project.startup_stage);
    const currentStageIdx = STAGE_ORDER.indexOf(currentStage);

    const stageMilestones = milestones.filter((m: { title: string; status?: string | null; is_completed?: boolean | null }) => {
      const mStage = normalizeStage(m.title);
      return mStage === currentStage;
    });

    // If no stage-tagged milestones, fall back to checking all incomplete milestones
    const milestonesToCheck = stageMilestones.length > 0
      ? stageMilestones
      : milestones;

    const allComplete = milestonesToCheck.length > 0 &&
      milestonesToCheck.every((m: { status?: string | null; is_completed?: boolean | null }) => m.status === "completed" || m.is_completed === true);

    const recentReflections = reflections
      .filter((r: { confidence?: number | null }) => typeof r.confidence === "number")
      .map((r: { confidence?: number | null }) => ({ confidence: r.confidence as number }));

    const check = shouldPromptStageTransition({
      stageMilestonesComplete: allComplete,
      recentReflections,
      recentOverrides: overrideCount,
    });

    let transitionMessage = "";
    if (check.shouldPrompt && currentStageIdx < STAGE_ORDER.length - 1) {
      const nextStage = STAGE_ORDER[currentStageIdx + 1];
      transitionMessage = `You've completed everything in ${currentStage} stage and your confidence has been consistently high. You're ready to move to ${nextStage}. This isn't automatic — you choose when to step forward. But the signals say you're ready.`;
    }

    return NextResponse.json({
      success: true,
      data: {
        shouldPrompt: check.shouldPrompt,
        reason: check.reason,
        currentStage,
        nextStage: currentStageIdx < STAGE_ORDER.length - 1
          ? STAGE_ORDER[currentStageIdx + 1]
          : null,
        transitionMessage,
        signals: {
          milestonesComplete: allComplete,
          milestonesChecked: milestonesToCheck.length,
          avgConfidence: recentReflections.length >= 3
            ? recentReflections.reduce((s: number, r: { confidence: number }) => s + r.confidence, 0) / recentReflections.length
            : null,
          reflectionCount: recentReflections.length,
          recentOverrides: overrideCount,
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Readiness check failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
