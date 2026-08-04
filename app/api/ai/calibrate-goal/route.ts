/**
 * app/api/ai/calibrate-goal/route.ts
 *
 * POST → uses BuildMind AI to generate a calibrated weekly goal for the founder,
 *         based on their startup stage, recent score, and streak.
 *
 * Body: { project_id, stage, execution_score, streak, startup_summary? }
 * Returns: { ok, goal_text, target_score, target_tasks }
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callModelJSON } from "@/lib/ai-providers";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    stage?: string;
    execution_score?: number;
    streak?: number;
    startup_summary?: string;
    project_name?: string;
    // FIX: previously not accepted at all — a founder's own typed goal
    // (GhostGoalBanner's "customText") was saved with target_score/
    // target_tasks computed purely from executionScore + streak, with
    // zero relation to what they actually wrote. When present, this now
    // gets analyzed directly instead of being ignored.
    custom_text?: string;
  };

  const stage          = body.stage ?? "Idea";
  const executionScore = body.execution_score ?? 50;
  const streak         = body.streak ?? 0;
  const summary        = body.startup_summary ?? "";
  const projectName    = body.project_name ?? "your startup";
  const customText     = body.custom_text?.trim();

  const stageHints: Record<string, string> = {
    Idea:       "talk to potential users and validate the core problem",
    Validation: "get 3+ genuine commitments (time, money, or workflow change)",
    MVP:        "ship a working version to at least 2 real users",
    Launch:     "drive 10+ qualified visitors or sign-ups through one channel",
    Growth:     "retain at least 60% of users week-over-week",
    Revenue:    "close or upsell one paying customer",
  };

  const hint = stageHints[stage] ?? "make one high-leverage move forward";

  // FIX: targetScore/targetTasks used to be a fixed formula off
  // executionScore/streak ALONE — identical regardless of what the goal
  // actually said. Kept here only as the fallback if the model call fails,
  // never as the primary source anymore.
  const fallbackTargetScore = Math.min(95, Math.max(55, executionScore + 10));
  const fallbackTargetTasks = streak >= 14 ? 7 : streak >= 7 ? 6 : 5;

  // ── Path 1: founder wrote their own goal — analyze ITS content for the
  //    numeric targets, don't touch the wording. ─────────────────────────
  if (customText && customText.length >= 5) {
    try {
      const result = await callModelJSON<{ target_score: number; target_tasks: number; reasoning?: string }>([
        {
          role: "system",
          content:
            "You calibrate numeric targets for a founder's stated weekly goal. Return JSON only: " +
            '{ "target_score": number (55-95), "target_tasks": number (2-10), "reasoning": string }. ' +
            "Base target_tasks on how many discrete actions the goal text implies (e.g. \"talk to 3 people\" implies ~3-4 tasks; \"ship a working version\" implies more, ~6-8). " +
            "Base target_score on how ambitious the stated goal is relative to current execution score — a bigger stretch goal should raise the bar more. Never invent a number not grounded in the goal text or the context given.",
        },
        {
          role: "user",
          content: `Founder's own stated goal for this week: "${customText}"\n\nContext: ${projectName}, stage ${stage}, current execution score ${executionScore}/100, streak ${streak} days.`,
        },
      ]);
      const targetScore = Math.min(95, Math.max(40, Math.round(result?.target_score ?? fallbackTargetScore)));
      const targetTasks = Math.min(10, Math.max(1, Math.round(result?.target_tasks ?? fallbackTargetTasks)));
      return NextResponse.json({ ok: true, goal_text: customText, target_score: targetScore, target_tasks: targetTasks });
    } catch (err) {
      console.error("[calibrate-goal] custom_text calibration error:", err);
      return NextResponse.json({ ok: true, goal_text: customText, target_score: fallbackTargetScore, target_tasks: fallbackTargetTasks });
    }
  }

  // ── Path 2: "Let AI choose" — generate goal text AND numbers together,
  //    in one call, so the numbers actually match what was just written
  //    instead of being computed independently by a fixed formula. ──────

  const prompt = `You are BuildMind, a founder operating system. Generate ONE concise, specific weekly goal for a founder, AND the numeric targets that match it.

Context:
- Startup: ${projectName}
- Stage: ${stage}
- Current execution score: ${executionScore}/100
- Current streak: ${streak} days
- Startup summary: ${summary || "Not provided"}
- Stage guidance: At ${stage} stage, the priority is to ${hint}.

The goal must:
1. Be specific to the ${stage} stage
2. Be achievable in one week
3. Include a measurable outcome where possible
4. Sound like a YC partner's advice — direct and practical, 1-2 sentences, max 60 words

Then set target_tasks to roughly how many discrete actions THAT SPECIFIC GOAL implies (not a generic number — "talk to 3 people" implies ~3-4 tasks, "ship a working version to 2 users" implies more, ~6-8). Set target_score (55-95) based on how ambitious this specific goal is relative to the current execution score.

Return JSON only: { "goal_text": string, "target_score": number, "target_tasks": number }`;

  try {
    const result = await callModelJSON<{ goal_text: string; target_score: number; target_tasks: number }>(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 200 },
    );

    const cleaned = (result?.goal_text ?? "")
      .replace(/^["']|["']$/g, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    if (!cleaned || cleaned.length < 10) {
      throw new Error("Empty response");
    }

    return NextResponse.json({
      ok: true,
      goal_text:    cleaned,
      target_score: Math.min(95, Math.max(40, Math.round(result?.target_score ?? fallbackTargetScore))),
      target_tasks: Math.min(10, Math.max(1, Math.round(result?.target_tasks ?? fallbackTargetTasks))),
    });
  } catch (err) {
    console.error("[calibrate-goal] AI error:", err);
    // Fallback to a deterministic goal
    const fallbacks: Record<string, string> = {
      Idea:       `This week, talk to 3 people who match your target user profile. Don't pitch — just listen. One honest conversation beats ten planning sessions.`,
      Validation: `This week, get 2 genuine commitment signals — someone who books a call, pre-pays, or changes their workflow for your product. Track every response.`,
      MVP:        `This week, put your MVP in front of 2 real users and watch them use it without guidance. Document every friction point they hit.`,
      Launch:     `This week, run one distribution experiment with a defined hypothesis. Measure click-through rate and time-on-page before optimising anything.`,
      Growth:     `This week, call 2 churned users. Ask only one question: what would have made you stay? Listen without defending.`,
      Revenue:    `This week, have one pricing conversation with an existing user. Find out what they'd pay for the next tier before you build it.`,
    };
    return NextResponse.json({
      ok:           true,
      goal_text:    fallbacks[stage] ?? fallbacks.Idea,
      target_score: fallbackTargetScore,
      target_tasks: fallbackTargetTasks,
    });
  }
}
