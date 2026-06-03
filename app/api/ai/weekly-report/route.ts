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
  // REC 2.1 + 2.2: intention vs execution headline number
  intention_vs_execution_rate?: number; // 0-100 percentage
  execution_trend?: "up" | "down" | "flat";
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
    let completedActionsBlock = "TASKS COMPLETED THIS WEEK: None recorded via Today page check-ins.";
    let reflectionsBlock = "REFLECTIONS: No reflections submitted this week.";
    let blockersLine = "";
    let prevWeekFocusLine = "";
    let avoidanceZonesLine = "";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();

      // Count user's projects
      const { data: userProjects } = await supabase
        .from("projects")
        .select("id, name, title, problem, startup_stage, description, validation_strengths, validation_weaknesses")
        .eq("user_id", userId);

      projects = userProjects?.length ?? 0;

      // Use the specified project or first one
      const activeProject = userProjects?.find(p => p.id === projectId) ?? userProjects?.[0];
      if (activeProject) {
        projectTitle = (activeProject.name ?? activeProject.title) ?? "";
        projectProblem = activeProject.problem ?? "";
        projectStage = activeProject.startup_stage ?? "";
        projectDescription = activeProject.description ?? "";
        strengths = activeProject.validation_strengths ?? [];
        weaknesses = activeProject.validation_weaknesses ?? [];
      }

      // Fetch tasks, milestones AND reflections for this week only
      // ─────────────────────────────────────────────────────────────
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      const weekAgoISO = weekAgo.toISOString();

      // Get milestones and tasks for all user projects
      const allProjectIds = (userProjects ?? []).map(p => p.id);
      if (allProjectIds.length > 0) {
        // Batch project IDs to avoid URL length limits
        const BATCH_SIZE = 20;
        const projectBatches: string[][] = [];
        for (let i = 0; i < allProjectIds.length; i += BATCH_SIZE) {
          projectBatches.push(allProjectIds.slice(i, i + BATCH_SIZE));
        }
        const milestoneResults = await Promise.all(projectBatches.map((batchIds) => {
          const milestonesQuery = supabase
            .from("milestones")
            .select("id, status, updated_at");
          return batchIds.length === 1
            ? milestonesQuery.eq("project_id", batchIds[0])
            : milestonesQuery.in("project_id", batchIds);
        }));
        const allMilestones: Array<{ id: string; status: string; updated_at?: string }> =
          milestoneResults.flatMap((result) => result.data ?? []);

        // Only count milestones completed THIS WEEK (not all-time)
        milestones = allMilestones.filter(m => {
          if (m.status !== 'completed') return false;
          const completedAt = m.updated_at ? new Date(m.updated_at) : null;
          return completedAt ? completedAt >= weekAgo : false;
        }).length;

        const milestoneIds = allMilestones.map(m => m.id);
        if (milestoneIds.length > 0) {
          // Batch milestone IDs to avoid URL length limits
          const milestoneBatches: string[][] = [];
          for (let i = 0; i < milestoneIds.length; i += BATCH_SIZE) {
            milestoneBatches.push(milestoneIds.slice(i, i + BATCH_SIZE));
          }
          const taskResults = await Promise.all(milestoneBatches.map((batchIds) => {
            const tasksQuery = supabase
              .from("tasks")
              .select("is_completed, updated_at")
              .eq("is_completed", true)
              .gte("updated_at", weekAgoISO); // Only tasks completed this week
            return batchIds.length === 1
              ? tasksQuery.eq("milestone_id", batchIds[0])
              : tasksQuery.in("milestone_id", batchIds);
          }));
          const allUserTasks: Array<{ is_completed: boolean; updated_at?: string }> =
            taskResults.flatMap((result) => result.data ?? []);

          tasks = allUserTasks.length; // All fetched tasks are already is_completed + this week

          // Also count Today-page activity. Reflections are the primary source
          // because they are written on every Today->Reflect flow.
          try {
            const { data: reflectionRows } = await supabase
              .from("reflections")
              .select("id, created_at, outcome")
              .eq("user_id", userId)
              .gte("created_at", weekAgoISO);
            const reflectionCount = (reflectionRows ?? []).length;

            const { data: reflexionRows } = await supabase
              .from("reflexion_learning_log")
              .select("id, created_at, outcome")
              .eq("user_id", userId)
              .neq("outcome", "pending")
              .gte("created_at", weekAgoISO);
            const reflexionCount = (reflexionRows ?? []).length;

            // Use the highest count — they overlap but should never undercount.
            tasks = Math.max(tasks, reflexionCount, reflectionCount);
          } catch { /* non-fatal */ }
        }
      }

      const [completedActionsResult, reflectionsResult, prevWeekMemoryResult] =
        await Promise.allSettled([
          supabase
            .from("reflexion_learning_log")
            .select("action_shown, action_type, created_at")
            .eq("user_id", userId)
            .eq("outcome", "completed")
            .gte("outcome_recorded_at", weekAgoISO)
            .order("outcome_recorded_at", { ascending: false })
            .limit(10),

          supabase
            .from("reflections")
            .select("outcome, confidence, note, what_tried, what_happened, what_learned, blocker, created_at")
            .eq("user_id", userId)
            .gte("created_at", weekAgoISO)
            .order("created_at", { ascending: false })
            .limit(7),

          supabase
            .from("founder_memory")
            .select("last_week_summary, avoidance_zones, last_insight")
            .eq("user_id", userId)
            .maybeSingle(),
        ]);

      const completedActions =
        completedActionsResult.status === "fulfilled"
          ? (completedActionsResult.value.data ?? [])
          : [];

      const weekReflections =
        reflectionsResult.status === "fulfilled"
          ? (reflectionsResult.value.data ?? [])
          : [];

      const founderMemory =
        prevWeekMemoryResult.status === "fulfilled"
          ? prevWeekMemoryResult.value.data
          : null;

      completedActionsBlock =
        completedActions.length > 0
          ? [
              "TASKS ACTUALLY COMPLETED THIS WEEK:",
              ...completedActions.map(
                (a, i) =>
                  `${i + 1}. "${a.action_shown}" (${a.action_type ?? "general"}, ${new Date(a.created_at).toLocaleDateString()})`,
              ),
            ].join("\n")
          : tasks > 0
            ? `TASKS COMPLETED THIS WEEK: ${tasks} check-ins recorded.`
            : "TASKS COMPLETED THIS WEEK: None recorded.";

      reflectionsBlock =
        weekReflections.length > 0
          ? [
              "REFLECTIONS FROM THIS WEEK (rich data - use this for behavioral analysis):",
              ...weekReflections.map((r, i) => {
                const date = new Date(r.created_at).toLocaleDateString();
                const lines = [
                  `[${i + 1}] ${date} - Outcome: ${r.outcome ?? "?"}, Confidence: ${r.confidence ?? "?"}/5`,
                ];
                if (r.what_tried) lines.push(`  Tried: "${r.what_tried}"`);
                if (r.what_happened) lines.push(`  Happened: "${r.what_happened}"`);
                if (r.what_learned) lines.push(`  Learned: "${r.what_learned}"`);
                if (r.blocker) lines.push(`  Blocker: "${r.blocker}"`);
                if (r.note && !r.what_tried) lines.push(`  Note: "${r.note}"`);
                return lines.join("\n");
              }),
            ].join("\n")
          : reflectionsBlock;

      const blockersThisWeek = weekReflections
        .map((r) => r.blocker)
        .filter((b): b is string => Boolean(b?.trim()));

      blockersLine =
        blockersThisWeek.length > 0
          ? `\nRECURRING BLOCKERS THIS WEEK:\n${blockersThisWeek.map((b) => `- "${b}"`).join("\n")}`
          : "";

      if (founderMemory?.last_week_summary) {
        try {
          const prev = JSON.parse(founderMemory.last_week_summary) as {
            next_week_focus?: string;
            biggest_gap?: string;
            tasks_completed?: number;
            intention_vs_execution_rate?: number;
          };
          if (prev.next_week_focus) {
            prevWeekFocusLine = `\nLAST WEEK'S STATED FOCUS: "${prev.next_week_focus}"`;
            if (prev.tasks_completed !== undefined) {
              prevWeekFocusLine += `\nLast week's task count: ${prev.tasks_completed}`;
            }
            if (prev.biggest_gap) {
              prevWeekFocusLine += `\nLast week's biggest gap: "${prev.biggest_gap}"`;
            }
          }
        } catch { /* non-fatal */ }
      }

      const avoidanceZones = (founderMemory?.avoidance_zones ?? []) as string[];
      avoidanceZonesLine =
        avoidanceZones.length > 0
          ? `\nKNOWN AVOIDANCE ZONES: ${avoidanceZones.join(", ")}`
          : "";
    }

    const momentumScore = clamp(15 + tasks * 7 + milestones * 10, 10, 95);

    // reflectionCount is the most reliable signal for Today-page activity
    // Re-derive it from tasks (which includes reflection rows) for the prompt
    const activitySignal = tasks > 0
      ? `${tasks} action${tasks !== 1 ? "s" : ""} completed or reflected on this week`
      : "No completed actions recorded this week";

    const systemPrompt = `You are a brutally honest startup coach. Return ONLY valid JSON with exactly these keys:
{
  "summary": "2-sentence momentum assessment",
  "intention_vs_action": "what they committed vs what they actually did this week",
  "biggest_gap": "the single biggest execution gap right now",
  "next_week_focus": "one specific thing to prioritize next week. This will become Monday's first task — make it concrete and actionable.",
  "honest_assessment": "a direct, uncomfortable truth about where this founder is headed",
  "momentum_score": <number 0-100>,
  "intention_vs_execution_rate": <number 0-100 — tasks completed / tasks committed this week>,
  "execution_trend": "up" | "down" | "flat"
}
No preamble. No markdown. Only JSON.`;

    const userPrompt = `Weekly behavioral data for this founder:

STARTUP: ${projectTitle || "Not set"} - ${projectStage || "Idea"} stage
PROBLEM BEING SOLVED: ${projectProblem || "Not specified"}
${projectDescription ? `DESCRIPTION: ${projectDescription}` : ""}
${strengths.length ? `STRENGTHS: ${strengths.join(", ")}` : ""}
${weaknesses.length ? `WEAKNESSES: ${weaknesses.join(", ")}` : ""}

HARD NUMBERS:
- Projects: ${projects}
- Milestones completed this week: ${milestones}
- Tasks/actions completed this week: ${tasks}
- Activity summary: ${activitySignal}
- Momentum score: ${momentumScore}/100

${completedActionsBlock}

${reflectionsBlock}
${blockersLine}
${prevWeekFocusLine}
${avoidanceZonesLine}

INSTRUCTION:
- Write intention_vs_action by comparing last week's stated focus above against what was actually done this week.
- Write biggest_gap based on what blockers recurred or what reflections show wasn't done despite being important.
- Write honest_assessment by looking at the pattern across all reflections - is the founder avoiding a particular type of work? Is confidence dropping? Are they shipping or rationalizing?
- Write next_week_focus as one concrete task the founder should do first on Monday, naming the product and user type.
- Be specific. Reference the actual tasks shown above. Do NOT write generic startup advice.
- If no reflections were submitted, say so directly in honest_assessment.`;

    let result: AIWeeklyReport = {
      summary: tasks === 0
        ? "No actions completed this week. The work isn't happening."
        : `${tasks} action${tasks !== 1 ? "s" : ""} completed this week. ${milestones > 0 ? `${milestones} milestone${milestones !== 1 ? "s" : ""} closed.` : "Keep closing milestones to build compound progress."}`,
      intention_vs_action: tasks === 0
        ? "You likely planned to make progress. No completed actions were recorded — either nothing happened or the check-in flow wasn't completed."
        : `You completed ${tasks} action${tasks !== 1 ? "s" : ""} this week. ${milestones > 0 ? "Milestones are closing." : "Next level: close a full milestone."}`,
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

    // REC 2.2: Weekly report is the primary writer of avoidance_zones to founder_memory.
    // Pull override reasons from reflections this week and update founder_memory.
    if (hasAdminEnv()) {
      try {
        const supabase = createAdminClient();
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data: weekReflections } = await supabase
          .from("reflections")
          .select("outcome, note, confidence")
          .eq("user_id", userId)
          .gte("created_at", weekAgo)
          .order("created_at", { ascending: false });

        if (weekReflections && weekReflections.length > 0) {
          // Extract avoidance signals from blocked/overridden reflections
          const blockedNotes = weekReflections
            .filter(r => r.outcome === "blocked" || r.confidence <= 2)
            .map(r => r.note)
            .filter(Boolean)
            .slice(0, 3);

          const avgConfidence = weekReflections.reduce((sum, r) => sum + (r.confidence ?? 3), 0) / weekReflections.length;

          // Write avoidance patterns and last week summary to founder_memory for Monday's task
          const { data: existingMemory } = await supabase
            .from("founder_memory")
            .select("avoidance_zones, last_insight")
            .eq("user_id", userId)
            .maybeSingle();

          const currentZones = (existingMemory?.avoidance_zones ?? []) as string[];
          const newInsight = result.biggest_gap;

          // Add new avoidance patterns detected this week
          const newZones = [...new Set([...currentZones, ...blockedNotes])].slice(0, 10);

          await supabase
            .from("founder_memory")
            .upsert({
              user_id: userId,
              avoidance_zones: newZones,
              last_insight: newInsight,
              // Store last week summary so Monday's task generator can reference it
              last_week_summary: JSON.stringify({
                tasks_completed: tasks,
                milestones_completed: milestones,
                avg_confidence: Math.round(avgConfidence * 10) / 10,
                biggest_gap: result.biggest_gap,
                next_week_focus: result.next_week_focus,
                // Intention vs execution rate — the single trend number for the founder
                intention_vs_execution_rate: result.intention_vs_execution_rate ?? null,
                execution_trend: result.execution_trend ?? "flat",
                // Avoidance pattern summary for Monday's task calibration
                avoidance_summary: newZones.slice(0, 3).join("; ") || null,
                // Count of blocked/overridden tasks this week
                override_count: blockedNotes.length,
                generated_at: new Date().toISOString(),
              }),
            }, { onConflict: "user_id" });
        }
      } catch {
        // Non-fatal — report still returns even if memory writeback fails
      }
    }

    // REC 2.1: Store next_week_focus as Monday's seed action
    // Today-action generator reads last_week_summary from founder_memory on Monday
    const reportData = {
      week_start_date: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      projects_count: projects,
      milestones_completed: milestones,
      tasks_completed: tasks,
      ai_summary: result.summary,
      ai_risks: result.biggest_gap,
      ai_suggestions: result.next_week_focus,
    };

    // Growth #4: Generate a share token so the report can be linked publicly.
    // Token is a random 16-byte hex string — not guessable, not user-derivable.
    // Stored in weekly_reports table so /reports/share/[token] can render it
    // without authentication. Founders share the URL on X/LinkedIn.
    const shareToken = crypto.randomUUID().replace(/-/g, "").slice(0, 24);

    // Upsert to weekly_reports for share URL persistence
    const supabaseForShare = createAdminClient();
    await supabaseForShare
      .from("weekly_reports")
      .upsert({
        user_id:     userId,
        share_token: shareToken,
        report_data: reportData,
        ai_summary:  result.summary,
        created_at:  new Date().toISOString(),
      }, { onConflict: "user_id,share_token" })
      .then(() => {});

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://buildmind.live"}/reports/share/${shareToken}`;

    return NextResponse.json({
      success: true,
      data: { ...result, reportData, shareToken, shareUrl },
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
