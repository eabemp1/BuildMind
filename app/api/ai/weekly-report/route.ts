import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AIWeeklyReport = {
  summary: string;
  intention_vs_action: string;
  biggest_gap: string;
  next_week_focus: string;
  honest_assessment: string;
  momentum_score: number;
};

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)); }

function getCronSecret(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  return request.headers.get("x-cron-secret") ?? bearer;
}

function isCronRequest(request: Request): boolean {
  return Boolean(process.env.CRON_SECRET && getCronSecret(request) === process.env.CRON_SECRET);
}

export async function POST(request: Request) {

  // ── Server-side plan enforcement (builder required) ───────────────────────
  const planCheck = await checkPlanAccess("builder");
  if (!planCheck.ok) return planCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    // Use the session-verified userId from planCheck — do NOT trust body.userId.
    const userId = planCheck.userId;
    const projectId = String(body?.projectId ?? "").trim();

    // Get data from Supabase directly — no Python backend needed
    let tasks = 0, milestones = 0, projects = 0;
    let projectTitle = "", projectProblem = "", projectStage = "", projectDescription = "";
    let strengths: string[] = [], weaknesses: string[] = [];

    if (hasAdminEnv()) {
      const supabase = createAdminClient();

      // Count user's projects
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id, title, problem, startup_stage, description, validation_strengths, validation_weaknesses")
        .eq("user_id", userId);

      projects = userProjects?.length ?? 0;

      // Use the specified project or first one
      const activeProject = userProjects?.find(p => p.id === projectId) ?? userProjects?.[0];
      if (activeProject) {
        projectTitle = activeProject.title ?? "";
        projectProblem = activeProject.problem ?? "";
        projectStage = activeProject.startup_stage ?? "";
        projectDescription = activeProject.description ?? "";
        strengths = activeProject.validation_strengths ?? [];
        weaknesses = activeProject.validation_weaknesses ?? [];
      }

      // Get milestones and tasks for all user projects
      const allProjectIds = (userProjects ?? []).map(p => p.id);
      if (allProjectIds.length > 0) {
        // Batch project IDs to avoid URL length limits
        let allMilestones: Array<{ id: string; status: string }> = [];
        const BATCH_SIZE = 20;
        
        for (let i = 0; i < allProjectIds.length; i += BATCH_SIZE) {
          const batchIds = allProjectIds.slice(i, i + BATCH_SIZE);
          const milestonesQuery = supabase
            .from("milestones")
            .select("id, status");
          const { data: userMilestones } = await (batchIds.length === 1
            ? milestonesQuery.eq("project_id", batchIds[0])
            : milestonesQuery.in("project_id", batchIds));
          if (userMilestones) allMilestones = allMilestones.concat(userMilestones);
        }

        milestones = allMilestones.filter(m => m.status === 'completed').length;

        const milestoneIds = allMilestones.map(m => m.id);
        if (milestoneIds.length > 0) {
          // Batch milestone IDs to avoid URL length limits
          let allUserTasks: Array<{ is_completed: boolean }> = [];
          for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
            const batchIds = milestoneIds.slice(i, i + BATCH_SIZE);
            const tasksQuery = supabase
              .from("tasks")
              .select("is_completed");
            const { data: userTasks } = await (batchIds.length === 1
              ? tasksQuery.eq("milestone_id", batchIds[0])
              : tasksQuery.in("milestone_id", batchIds));
            if (userTasks) allUserTasks = allUserTasks.concat(userTasks);
          }

          tasks = allUserTasks.filter(t => t.is_completed).length;
        }
      }
    }

    const momentumScore = clamp(15 + tasks * 7 + milestones * 10, 10, 95);

    const systemPrompt = `You are a brutally honest startup coach. Return ONLY valid JSON with exactly these keys:
{
  "summary": "2-sentence momentum assessment",
  "intention_vs_action": "what they committed vs what they actually did this week",
  "biggest_gap": "the single biggest execution gap right now",
  "next_week_focus": "one specific thing to prioritize next week",
  "honest_assessment": "a direct, uncomfortable truth about where this founder is headed",
  "momentum_score": <number 0-100>
}
No preamble. No markdown. Only JSON.`;

    const userPrompt = `Weekly data for this founder:
Projects: ${projects}
Milestones completed total: ${milestones}
Tasks completed total: ${tasks}
Momentum score (pre-computed): ${momentumScore}
${projectTitle ? `\nActive project: ${projectTitle}` : ""}
${projectStage ? `Stage: ${projectStage}` : ""}
${projectProblem ? `Problem being solved: ${projectProblem}` : ""}
${projectDescription ? `Description: ${projectDescription}` : ""}
${strengths.length ? `Strengths: ${strengths.join(", ")}` : ""}
${weaknesses.length ? `Weaknesses: ${weaknesses.join(", ")}` : ""}

Be specific. No generic startup advice. Reference what you actually see in the data.`;

    let result: AIWeeklyReport = {
      summary: tasks === 0
        ? "No tasks completed this week. The work isn't happening."
        : `${tasks} task${tasks !== 1 ? "s" : ""} closed this week. ${milestones > 0 ? `${milestones} milestone${milestones !== 1 ? "s" : ""} complete.` : "No milestones closed yet."}`,
      intention_vs_action: tasks === 0
        ? "You likely planned to make progress. You didn't complete any recorded tasks."
        : `You completed ${tasks} task${tasks !== 1 ? "s" : ""}. Closing milestones consistently is the next level.`,
      biggest_gap: milestones === 0
        ? "No milestones closed. You're doing tasks but not finishing anything."
        : weaknesses.length > 0
          ? weaknesses[0]
          : "Keep pushing — the gap between where you are and launch is still significant.",
      next_week_focus: `Close at least ${Math.max(1, Math.ceil(tasks * 0.5) + 1)} tasks and finish one complete milestone.`,
      honest_assessment: tasks === 0
        ? "You are not building. You're planning to build. Those are different things."
        : "Progress is real but pace is slow. You need to double the weekly output to hit your goals.",
      momentum_score: momentumScore,
    };

    try {
      const ai = await groqJSON<AIWeeklyReport>(systemPrompt, userPrompt);
      if (ai?.summary && typeof ai.momentum_score === "number") {
        result = {
          ...ai,
          momentum_score: clamp(Math.round(ai.momentum_score), 10, 95),
        };
      }
    } catch {
      // use fallback — still better than crashing
    }

    // Also store summary back to report data for the static report section
    const reportData = {
      week_start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      projects_count: projects,
      milestones_completed: milestones,
      tasks_completed: tasks,
      ai_summary: result.summary,
      ai_risks: result.biggest_gap,
      ai_suggestions: result.next_week_focus,
    };

    return NextResponse.json({
      success: true,
      data: { ...result, reportData },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Report failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  if (!isCronRequest(request) && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Unauthorized", hint: "Vercel Cron must send Authorization: Bearer <CRON_SECRET>." },
      { status: 401 },
    );
  }

  if (!hasAdminEnv()) {
    return NextResponse.json(
      { success: false, error: "Supabase admin env is missing." },
      { status: 500 },
    );
  }

  const supabase = createAdminClient();
  const { data: builderUsers, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const builderCount = builderUsers.users.filter((user) => user.user_metadata?.plan === "builder").length;

  return NextResponse.json({
    success: true,
    cron: true,
    message: "Weekly report cron is reachable. Reports are generated on-demand for Builder users from /reports.",
    builderUsers: builderCount,
  });
}
