import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeStartupScore } from "@/lib/buildmind";
import { getCanonicalStage } from "@/lib/stages";

/**
 * app/api/projects/scores/route.ts — NEW
 *
 * Fix #1: Projects page score now comes from the server (same source as
 * Today/Dashboard pages) so the score ring is consistent across all pages
 * and devices.
 *
 * Fix #12 / #14: All cross-device stats come from Supabase, not localStorage.
 *
 * GET /api/projects/scores?ids=uuid1,uuid2,...
 *   → { scores: { [projectId]: number }, stages: { [projectId]: string } }
 *
 * If `ids` is omitted, returns scores for ALL projects owned by the user.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");
    const projectIds = idsParam ? idsParam.split(",").filter(Boolean) : null;

    const admin = createAdminClient();

    // Fetch projects
    let projectsQuery = admin
      .from("projects")
      .select("id, startup_stage, validation_strengths, execution_score, momentum_score, created_at")
      .eq("user_id", user.id);
    if (projectIds?.length) {
      projectsQuery = projectsQuery.in("id", projectIds);
    }
    const { data: projects, error: projError } = await projectsQuery;
    if (projError) {
      return NextResponse.json({ ok: false, error: projError.message }, { status: 500 });
    }

    // Fetch milestones + tasks for score computation
    const pIds = (projects ?? []).map((p) => p.id);
    const [milestonesResult, tasksResult] = await Promise.all([
      pIds.length
        ? admin.from("milestones").select("id, project_id, title, status, created_at").in("project_id", pIds)
        : Promise.resolve({ data: [], error: null }),
      pIds.length
        ? admin.from("tasks").select("id, milestone_id, is_completed").in("project_id", pIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const milestones = milestonesResult.data ?? [];
    const tasks = tasksResult.data ?? [];

    // Build per-project score and canonical stage
    const scores: Record<string, number> = {};
    const stages: Record<string, string> = {};
    let founderContext: { streak?: number | null; xp?: number | null } | null = null;
    const founderContextWithXp = await admin
      .from("founder_context")
      .select("streak,xp")
      .eq("user_id", user.id)
      .maybeSingle();
    if (founderContextWithXp.error && /column|schema cache|could not find/i.test(founderContextWithXp.error.message)) {
      const founderContextWithoutXp = await admin
        .from("founder_context")
        .select("streak")
        .eq("user_id", user.id)
        .maybeSingle();
      founderContext = founderContextWithoutXp.data ?? null;
    } else {
      founderContext = founderContextWithXp.data ?? null;
    }

    for (const project of projects ?? []) {
      const pMilestones = milestones.filter((m) => m.project_id === project.id);
      const pTasks = tasks.filter((t) =>
        pMilestones.some((m) => m.id === t.milestone_id)
      );

      // Build milestoneIdMap: milestoneId → milestoneTitle
      const milestoneIdMap = new Map(pMilestones.map((m) => [m.id, m.title]));

      scores[project.id] = computeStartupScore({
        validation_strengths: Array.isArray(project.validation_strengths)
          ? project.validation_strengths
          : [],
        execution_score: project.execution_score ?? 0,
        momentum_score: project.momentum_score ?? 50,
        xp: founderContext?.xp ?? 0,
        streak: founderContext?.streak ?? 0,
      });

      // Fix #15: canonical stage — always use startup_stage from DB first
      stages[project.id] = getCanonicalStage(
        project.startup_stage,
        pMilestones,
        pTasks.map((t) => ({ milestone_id: t.milestone_id, is_completed: t.is_completed })),
        milestoneIdMap,
      );
    }

    return NextResponse.json({ ok: true, scores, stages });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed" },
      { status: 500 }
    );
  }
}
