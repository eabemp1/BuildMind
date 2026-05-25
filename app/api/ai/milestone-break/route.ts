/**
 * app/api/ai/milestone-break/route.ts
 *
 * Fires automatically when a milestone is marked complete.
 * Runs a lightweight Break My Startup analysis and stores the result in
 * `founder_memory.pending_milestone_break` so the Today page can surface
 * it as a mandatory interstitial before the founder moves on.
 *
 * Also fires on stage transitions (triggerType === "stage_transition").
 */

import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type MilestoneBreakResult = {
  trigger: "milestone_complete" | "stage_transition";
  triggerLabel: string; // milestone title or "Idea → Validation"
  brutal_points: [string, string, string]; // exactly 3 brutal points
  recommended_action: string; // one concrete action before continuing
  generated_at: string;
};

export async function POST(request: Request) {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? "").trim();
    const milestoneTitle = String(body?.milestoneTitle ?? "").trim();
    const triggerType: "milestone_complete" | "stage_transition" =
      body?.triggerType === "stage_transition" ? "stage_transition" : "milestone_complete";
    const previousStage = String(body?.previousStage ?? "").trim();
    const currentStage = String(body?.currentStage ?? "").trim();

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });
    }

    // Get project context
    let projectTitle = "";
    let projectProblem = "";
    let projectDescription = "";
    let targetUsers = "";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();
      const { data: project } = await supabase
        .from("projects")
        .select("title, problem, description, target_users, startup_stage")
        .eq("id", projectId)
        .eq("user_id", userId)
        .maybeSingle();

      if (project) {
        projectTitle = project.title ?? "";
        projectProblem = project.problem ?? "";
        projectDescription = project.description ?? "";
        targetUsers = project.target_users ?? "";
      }
    }

    const triggerLabel =
      triggerType === "stage_transition" && previousStage && currentStage
        ? `${previousStage} → ${currentStage}`
        : milestoneTitle || "milestone completed";

    const contextLines = [
      projectTitle ? `Startup: ${projectTitle}` : "",
      projectProblem ? `Problem: ${projectProblem}` : "",
      projectDescription ? `Description: ${projectDescription}` : "",
      targetUsers ? `Target users: ${targetUsers}` : "",
      currentStage ? `Current stage: ${currentStage}` : "",
      triggerType === "milestone_complete"
        ? `Just completed milestone: "${milestoneTitle}"`
        : `Just transitioned from ${previousStage} to ${currentStage}`,
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = `You are a brutally honest startup critic. A founder just completed a milestone.
Your job is to identify the 3 most dangerous assumptions they are about to carry forward unchecked.
Be specific to their startup — no generic startup advice.
Return ONLY valid JSON:
{
  "brutal_points": ["specific risk 1", "specific risk 2", "specific risk 3"],
  "recommended_action": "one concrete thing to do before moving forward (max 20 words)"
}
No preamble. No markdown. Only JSON.`;

    const userPrompt = contextLines;

    // Fallback in case AI fails
    let brutal_points: [string, string, string] = [
      "You haven't validated that users will pay, not just use it.",
      "Your distribution channel is still an assumption, not a proven path.",
      "The problem you solved in this milestone may not be the core problem users care about.",
    ];
    let recommended_action =
      "Talk to 3 users who haven't seen your product yet and ask what problem they'd pay to solve.";

    try {
      const ai = await groqJSON<{
        brutal_points: string[];
        recommended_action: string;
      }>(systemPrompt, userPrompt);

      if (ai?.brutal_points?.length >= 3 && ai?.recommended_action) {
        brutal_points = [
          ai.brutal_points[0],
          ai.brutal_points[1],
          ai.brutal_points[2],
        ] as [string, string, string];
        recommended_action = ai.recommended_action;
      }
    } catch {
      // use fallback
    }

    const result: MilestoneBreakResult = {
      trigger: triggerType,
      triggerLabel,
      brutal_points,
      recommended_action,
      generated_at: new Date().toISOString(),
    };

    // Store in founder_memory.pending_milestone_break
    // Today page reads this and shows the interstitial on next load
    if (hasAdminEnv()) {
      const supabase = createAdminClient();
      await supabase
        .from("founder_memory")
        .upsert(
          {
            user_id: userId,
            pending_milestone_break: JSON.stringify(result),
          },
          { onConflict: "user_id" }
        );
    }

    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "milestone-break failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
