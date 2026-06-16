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
import { callModel } from "@/lib/ai-providers";

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
  };

  const stage          = body.stage ?? "Idea";
  const executionScore = body.execution_score ?? 50;
  const streak         = body.streak ?? 0;
  const summary        = body.startup_summary ?? "";
  const projectName    = body.project_name ?? "your startup";

  const stageHints: Record<string, string> = {
    Idea:       "talk to potential users and validate the core problem",
    Validation: "get 3+ genuine commitments (time, money, or workflow change)",
    MVP:        "ship a working version to at least 2 real users",
    Launch:     "drive 10+ qualified visitors or sign-ups through one channel",
    Growth:     "retain at least 60% of users week-over-week",
    Revenue:    "close or upsell one paying customer",
  };

  const hint = stageHints[stage] ?? "make one high-leverage move forward";

  // Derive a sensible target score based on current performance
  const targetScore = Math.min(95, Math.max(55, executionScore + 10));
  // Target tasks: beginners do 5, consistent builders do 7
  const targetTasks = streak >= 14 ? 7 : streak >= 7 ? 6 : 5;

  const prompt = `You are BuildMind, a founder operating system. Generate ONE concise, specific weekly goal for a founder.

Context:
- Startup: ${projectName}
- Stage: ${stage}
- Current execution score: ${executionScore}/100
- Current streak: ${streak} days
- Startup summary: ${summary || "Not provided"}
- Stage guidance: At ${stage} stage, the priority is to ${hint}.

Generate a focused, concrete weekly goal in 1-2 sentences. It must:
1. Be specific to the ${stage} stage
2. Be achievable in one week
3. Include a measurable outcome where possible
4. Sound like a YC partner's advice — direct and practical

Reply with ONLY the goal text. No labels, no JSON, no preamble. Maximum 60 words.`;

  try {
    const goalText = await callModel(
      [{ role: "user", content: prompt }],
      { role: "fast", maxTokens: 120 },
    );

    const cleaned = goalText
      .replace(/^["']|["']$/g, "")
      .replace(/<think>[\s\S]*?<\/think>/gi, "")
      .trim();

    if (!cleaned || cleaned.length < 10) {
      throw new Error("Empty response");
    }

    return NextResponse.json({
      ok: true,
      goal_text:    cleaned,
      target_score: targetScore,
      target_tasks: targetTasks,
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
      target_score: targetScore,
      target_tasks: targetTasks,
    });
  }
}
