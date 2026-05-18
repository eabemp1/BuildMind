import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

/**
 * POST /api/ai/stage-transition-challenge
 *
 * REC 2.4: Every stage transition triggers a Break My Startup run focused on
 * the assumptions that powered the previous stage. Called automatically when
 * inferStage() detects a stage change, or when a milestone is completed (REC 2.3).
 *
 * Returns a challenge object stored against the project for display on next session.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STAGE_TRANSITION_PROMPTS: Record<string, string> = {
  "Idea→Validation": `The founder has just moved from Idea stage to Validation.
They spent the Idea stage forming assumptions about their problem, their users, and the market.
Challenge each assumption ruthlessly. What is most likely wrong?
What would a YC partner say about the move to validation?
What is the single most dangerous assumption they are carrying forward?`,

  "Validation→MVP": `The founder has just moved from Validation to MVP — they are now building.
This is where most founders start building the wrong thing with confidence.
Challenge the assumptions that passed validation. Were their validators representative?
Did they test willingness to pay or just enthusiasm?
What would they discover in week 2 of real users that would invalidate what they built?`,

  "MVP→Launch": `The founder has just moved from MVP to Launch stage.
This is where most founders discover their early users were not representative of the real market.
What assumptions about distribution are they carrying into launch that haven't been tested?
What would make their launch a catastrophic failure — and how likely is that?
A YC partner who has seen 1,000 launches would ask: what is the fatal flaw they cannot see right now?`,

  "Launch→Growth": `The founder has just moved from Launch to Growth.
They have some users. Now they need to scale what's working.
What assumptions about what drove their early growth are wrong?
What will break first as they try to scale?
What would a growth hacker say is the one thing they are not doing that would 10x their acquisition?`,

  "milestone_complete": `A founder has just completed a milestone — a meaningful phase of their work.
Challenge the assumptions that milestone was built on.
What is most likely wrong about what they just proved?
What should they verify before treating these assumptions as settled?
What would a critical investor say about this milestone completion?`,
};

type TransitionChallenge = {
  transition: string;
  challenges: string[];
  recommended_action: string;
  milestone_sentence: string;
};

export async function POST(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? routeUser.userId).trim();
    const projectId = String(body?.projectId ?? "").trim();
    const previousStage = String(body?.previousStage ?? "").trim();
    const currentStage = String(body?.currentStage ?? "").trim();
    const milestoneTitle = String(body?.milestoneTitle ?? "").trim();
    const triggerType = String(body?.triggerType ?? "milestone_complete").trim();

    if (userId !== routeUser.userId) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    // Enforce free-tier daily + monthly AI cap before calling Groq
    await enforceAndTrackAIUsage(routeUser.userId, routeUser.plan);

    let projectContext = "";

    if (hasAdminEnv() && projectId) {
      const supabase = createAdminClient();
      const { data: project } = await supabase
        .from("projects")
        .select("name, title, description, problem, target_users, startup_stage")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();

      if (project) {
        projectContext = `Project: ${project.name ?? project.title}
Problem: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}`;
      }
    }

    const transitionKey = triggerType === "stage_transition"
      ? `${previousStage}→${currentStage}`
      : "milestone_complete";

    const stagePrompt = STAGE_TRANSITION_PROMPTS[transitionKey]
      ?? STAGE_TRANSITION_PROMPTS["milestone_complete"];

    const systemPrompt = `You are a YC partner doing a hard review of a founder's assumptions at a critical transition point. Return ONLY valid JSON with exactly these keys:
{
  "challenges": ["challenge 1", "challenge 2", "challenge 3"],
  "recommended_action": "one concrete action to take before moving on",
  "milestone_sentence": "one sentence that captures what completing this phase actually means for the founder's journey"
}
Be specific. No generic startup advice. Reference their actual problem and market. Be direct and uncomfortable.`;

    const contextLine = milestoneTitle
      ? `Milestone just completed: "${milestoneTitle}"\n`
      : triggerType === "stage_transition"
        ? `Stage transition: ${previousStage} → ${currentStage}\n`
        : "";

    const userPrompt = `${contextLine}${projectContext ? `\nProject context:\n${projectContext}\n` : ""}
${stagePrompt}

Return ONLY the JSON object.`;

    const fallback: TransitionChallenge = {
      transition: transitionKey,
      challenges: [
        "Your early users may not represent your real market — verify before assuming they do.",
        "The assumptions that got you here are the ones most likely to be wrong going forward.",
        "What would make this milestone meaningless in hindsight? Name it before you move on.",
      ],
      recommended_action: "Before your next milestone, write down the three assumptions you're treating as proven. Verify at least one of them with a new person this week.",
      milestone_sentence: milestoneTitle
        ? `You've completed "${milestoneTitle}" — the question now is what this proves, and what it doesn't.`
        : "Milestone complete — the assumptions you built it on have never been tested under real conditions. That changes now.",
    };

    let result: TransitionChallenge;
    try {
      const ai = await groqJSON<TransitionChallenge>(systemPrompt, userPrompt);
      if (ai?.challenges?.length && ai.recommended_action && ai.milestone_sentence) {
        result = { ...ai, transition: transitionKey };
      } else {
        result = fallback;
      }
    } catch {
      result = fallback;
    }

    // Store the challenge against the project for display on next session
    if (hasAdminEnv() && projectId) {
      try {
        const supabase = createAdminClient();
        await supabase
          .from("projects")
          .update({
            pending_transition_challenge: JSON.stringify({
              ...result,
              milestone_title: milestoneTitle || null,
              trigger_type: triggerType,
              generated_at: new Date().toISOString(),
              acknowledged: false,
            }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .eq("user_id", userId);
      } catch {
        // Non-fatal — challenge still returned in response
      }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Challenge generation failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
