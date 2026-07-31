/**
 * app/api/ai/milestone-break/route.ts
 *
 * Fires automatically when a milestone is marked complete.
 * Runs a lightweight Break My Startup analysis and stores the result in
 * `founder_memory.pending_milestone_break` so the Today page can surface
 * it as a mandatory interstitial before the founder moves on.
 *
 * Also fires on stage transitions (triggerType === "stage_transition").
 *
 * As of the milestone-stall-detection change (2026-07-31), also fires on
 * triggerType === "stalling" — called by app/api/cron/milestone-stall,
 * not from the client, when a milestone has been open well past its
 * estimated_days. The interstitial copy for this trigger is intentionally
 * different (not "you just completed X" — see app/today/page.tsx render
 * branch) since nothing was actually finished.
 */

import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

type MilestoneBreakResult = {
  trigger: "milestone_complete" | "stage_transition" | "stalling";
  triggerLabel: string; // milestone title, "Idea → Validation", or the stalled milestone title
  brutal_points: [string, string, string]; // exactly 3 brutal points
  recommended_action: string; // one concrete action before continuing
  generated_at: string;
};

// Same CRON_SECRET check as app/api/cron/re-engage/route.ts — this route
// needs a second auth path because getRouteUser() requires a real browser
// session cookie (see app/api/ai/_planCheck.ts, checkPlanAccess ->
// supabase.auth.getUser()), which does not exist on a server-to-server
// cron call. The cron passes userId explicitly in the body instead, same
// as every other cron in this codebase that acts on behalf of a user.
function isCronRequest(req: Request): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const triggerType: "milestone_complete" | "stage_transition" | "stalling" =
      body?.triggerType === "stage_transition"
        ? "stage_transition"
        : body?.triggerType === "stalling"
          ? "stalling"
          : "milestone_complete";

    let userId: string;
    if (triggerType === "stalling") {
      // Cron-only trigger — session auth is impossible here, use CRON_SECRET.
      if (!isCronRequest(request)) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      userId = String(body?.userId ?? "").trim();
      if (!userId) {
        return NextResponse.json({ ok: false, error: "userId required for stalling trigger" }, { status: 400 });
      }
    } else {
      const userResult = await getRouteUser();
      if (!userResult?.user) {
        return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }
      userId = userResult.user.id;
    }

    const projectId = String(body?.projectId ?? "").trim();
    const milestoneTitle = String(body?.milestoneTitle ?? "").trim();
    const previousStage = String(body?.previousStage ?? "").trim();
    const currentStage = String(body?.currentStage ?? "").trim();
    // Stalling-only fields
    const daysOverEstimate = Number(body?.daysOverEstimate ?? 0);
    const difficulty = Number(body?.difficulty ?? 0);

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
        : triggerType === "stage_transition"
          ? `Just transitioned from ${previousStage} to ${currentStage}`
          : `Has been stuck on milestone "${milestoneTitle}" for ${daysOverEstimate} day(s) beyond its estimate (difficulty ${difficulty || "unrated"}/5). No stage change, no completion — this milestone just hasn't moved.`,
    ]
      .filter(Boolean)
      .join("\n");

    const systemPrompt = triggerType === "stalling"
      ? `You are a direct, non-judgmental startup co-founder. A solo founder has been stuck on one milestone for longer than expected.
Your job is NOT to guilt them — solo founders juggle this alongside other obligations and going overboard on an estimate is often fine. Your job is to identify the 3 most likely REAL reasons a milestone stalls at this stage (e.g. the milestone is actually too big and needs splitting, a specific unknown is blocking progress, the task list no longer matches what's actually needed) and offer one concrete unblocking action — not a generic "just push through" message.
Be specific to their startup — no generic productivity advice.
Return ONLY valid JSON:
{
  "brutal_points": ["specific likely blocker 1", "specific likely blocker 2", "specific likely blocker 3"],
  "recommended_action": "one concrete unblocking move — split the milestone, name the exact next micro-step, or similar (max 20 words)"
}
No preamble. No markdown. Only JSON.`
      : `You are a brutally honest startup critic. A founder just completed a milestone.
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
    let brutal_points: [string, string, string] = triggerType === "stalling"
      ? [
          "This milestone may be scoped too large for a single action — it might need splitting into smaller steps.",
          "There could be one specific unknown blocking progress that hasn't been named yet.",
          "The original task list may no longer match what this milestone actually needs.",
        ]
      : [
          "You haven't validated that users will pay, not just use it.",
          "Your distribution channel is still an assumption, not a proven path.",
          "The problem you solved in this milestone may not be the core problem users care about.",
        ];
    let recommended_action = triggerType === "stalling"
      ? "Write down the single next concrete step — if you can't name one, the milestone needs splitting."
      : "Talk to 3 users who haven't seen your product yet and ask what problem they'd pay to solve.";

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
