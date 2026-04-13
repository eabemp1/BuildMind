import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

type TodayAction = {
  action: string;
  message: string;
  why: string;
  time: string;
};

const FALLBACK_ACTIONS: Record<string, TodayAction> = {
  Idea: {
    action: "Talk to 5 people who have this problem before writing any code.",
    message: "Hey, quick question — what's your biggest challenge with [problem area]? I'm researching it and would love 10 minutes.",
    why: "Every assumption you have about your user is probably wrong. Conversations cost nothing to invalidate them.",
    time: "2 hours",
  },
  Validation: {
    action: "Send 10 personal outreach DMs — no pitch, just questions.",
    message: "Hey — I'm building something for people who struggle with [problem]. What do you currently do when [problem] happens?",
    why: "The Mom Test: ask about their life, not your idea. You'll get honest answers that way.",
    time: "1–2 hours",
  },
  MVP: {
    action: "Send your working link to one warm contact before end of day.",
    message: "Hey — I've been building [product] to solve [problem]. It's rough but working. Would you try it for 10 minutes and tell me what breaks?",
    why: "The version they see today teaches you more than 3 more days of polishing. Ship it.",
    time: "30 minutes",
  },
  Launch: {
    action: "Post on Product Hunt this week — imperfect listing beats no listing.",
    message: "We just launched [product] — it [solves problem] for [target users]. Would love your support and feedback: [link]",
    why: "You don't need to be ready. You need to be visible.",
    time: "3 hours to prepare",
  },
  Growth: {
    action: "Pick one retention lever and run a 7‑day experiment.",
    message: "We're testing a small change to improve retention. Can I show you the experiment and get your honest take?",
    why: "Small, repeatable experiments compound faster than big bets.",
    time: "2 hours",
  },
  Revenue: {
    action: "Call one churned user today — not to win them back, to learn why they left.",
    message: "Hey — I noticed you stopped using [product]. No sales pitch. I just want to understand what didn’t work. 10 minutes?",
    why: "Churn analysis beats 10 feature ideas every time.",
    time: "1 hour",
  },
};

function inferStage(completedTasks: number, totalTasks: number, completedMilestones: number, totalMilestones: number): string {
  if (totalTasks === 0) return "Idea";
  const taskRate = completedTasks / Math.max(1, totalTasks);
  const milestoneRate = completedMilestones / Math.max(1, totalMilestones);
  if (milestoneRate >= 0.8) return "Revenue";
  if (milestoneRate >= 0.6) return "Launch";
  if (milestoneRate >= 0.4) return "MVP";
  if (milestoneRate >= 0.2 || taskRate >= 0.3) return "Validation";
  return "Idea";
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const projectId = String(body?.projectId ?? "").trim();
    const providedStage = String(body?.stage ?? "").trim();

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId);

    let projectContext = "";
    let stage = providedStage || "Idea";
    let targetUsers = "";
    let problem = "";
    let title = "";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();
      const { data: project } = await supabase
        .from("projects")
        .select("title, description, target_users, problem, startup_stage")
        .eq("id", projectId)
        .eq("user_id", userId)
        .single();

      const { data: milestones } = await supabase
        .from("milestones")
        .select("id, title, is_completed")
        .eq("project_id", projectId)
        .order("order_index", { ascending: true });

      const milestoneIds = (milestones ?? []).map((m) => m.id);
      const { data: tasks } = milestoneIds.length
        ? await supabase.from("tasks").select("title, is_completed, milestone_id").in("milestone_id", milestoneIds)
        : { data: [] };

      const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
      const totalTasks = (tasks ?? []).length;
      const completedMilestones = (milestones ?? []).filter((m) => m.is_completed).length;

      if (project) {
        stage = project.startup_stage ?? inferStage(completedTasks, totalTasks, completedMilestones, (milestones ?? []).length);
        targetUsers = project.target_users ?? "";
        problem = project.problem ?? "";
        title = project.title ?? "";
        projectContext = `
Project: ${project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}
Milestones: ${(milestones ?? []).map((m) => `${m.title} (${m.is_completed ? "complete" : "in progress"})`).join(", ")}
Tasks: ${completedTasks}/${totalTasks} completed`;
      }
    }

    const fallback = FALLBACK_ACTIONS[stage] ?? FALLBACK_ACTIONS["Idea"];

    const result = await groqJSON<TodayAction>(
      `You are BuildMind, a brutally honest execution coach.
Return JSON ONLY with keys: action, message, why, time.
- action: a single concrete task to do TODAY
- message: a short outreach/script or next-step message
- why: 1-2 sentences explaining why this matters now
- time: realistic time estimate (e.g. "45 minutes")
Keep it specific to the user's stage and project. No fluff.`,
      `FOUNDER DATA:
${projectContext || "Project data unavailable"}

Project title: ${title || "N/A"}
Stage: ${stage}
Problem: ${problem || "N/A"}
Target users: ${targetUsers || "N/A"}
`,
    ).catch(() => fallback);

    return NextResponse.json({ success: true, data: { ...fallback, ...result, stage } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Today action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
