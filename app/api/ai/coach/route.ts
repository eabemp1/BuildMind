import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

// Infer stage from task/milestone completion when startup_stage is null
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
    const message = String(body?.message ?? "").trim();
    const blockerType = String(body?.blockerType ?? "").trim();
    const domain = String(body?.domain ?? "").trim();
    const history = Array.isArray(body?.messages)
      ? (body.messages as { role?: string; content?: string }[])
          .map((m) => ({ role: (m?.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: String(m?.content ?? "").trim() }))
          .filter((m) => m.content)
          .slice(-8)
      : [];

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId);

    // Build project context from Supabase
    let projectContext = "";
    let stage = "MVP";

    if (hasAdminEnv()) {
      const supabase = createAdminClient();

      const { data: project } = await supabase
        .from("projects")
        .select("title, description, target_users, problem, startup_stage, validation_strengths, validation_weaknesses")
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
      const inferredStage = inferStage(completedTasks, totalTasks, completedMilestones, (milestones ?? []).length);

      if (project) {
        stage = inferredStage || project.startup_stage || "Idea";
        projectContext = `
Project: ${project.title}
Stage: ${stage}
Problem: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}
Milestones: ${(milestones ?? []).map((m) => `${m.title} (${m.is_completed ? "done" : "pending"})`).join(", ")}
Tasks: ${completedTasks}/${totalTasks} completed
Strengths: ${(project.validation_strengths ?? []).join(", ") || "None logged"}
Weaknesses: ${(project.validation_weaknesses ?? []).join(", ") || "None logged"}`;
      }
    }

    const blockerContext = blockerType ? `\nFounder's stated blocker: "${blockerType}"` : "";
    const domainContext = domain ? `\nFounder's domain: ${domain}` : "";

    // Build conversation context string for the prompt
    const historyContext = history.length > 0
      ? "\n\nConversation so far:\n" + history.map((m) => `${m.role === "user" ? "Founder" : "Coach"}: ${m.content}`).join("\n")
      : "";

    const systemPrompt = `You are BuildMind — a direct, honest AI coach for founders. You are NOT a rigid task-pusher. You think like a great coach: you have context on their project, but you follow the conversation.

You must return ONLY valid JSON with exactly these two fields:
{
  "reasoning": ["step 1", "step 2", "step 3"],
  "answer": "your response here"
}

The "reasoning" array: 2-4 short internal thinking steps (8-15 words each). Show what you're noticing about this specific founder's situation.

Answer rules:
- READ THE FOUNDER'S MESSAGE FIRST. If they ask a follow-up question, answer it directly and completely.
- If they ask something unrelated to their project, engage honestly — then optionally connect back.
- If they ask for your opinion, give it. Do not deflect or redirect.
- Only push toward a specific action when it naturally fits.
- If they seem stuck or avoiding, call it out — but AFTER answering what they actually asked.
- Under 200 words. Dense and direct. Never say "Great question!" Never use filler.

${projectContext ? `FOUNDER'S REAL DATA:\n${projectContext}` : ""}${blockerContext}${domainContext}${historyContext}

Founder's message: ${message}

Return ONLY the JSON object. No preamble. No markdown.`;

    const result = await groqJSON<{ reasoning: string[]; answer: string }>(
      systemPrompt,
      message,
    );

    // Validate and normalize
    const reasoning = Array.isArray(result?.reasoning) && result.reasoning.length > 0
      ? result.reasoning.slice(0, 4).map((r) => String(r).trim()).filter(Boolean)
      : ["Reading your project data...", "Identifying the key constraint...", "Deciding what matters most right now..."];

    const answer = typeof result?.answer === "string" && result.answer.trim().length > 10
      ? result.answer.trim()
      : "BuildMind couldn't generate a response right now. Focus on your most important open task.";

    await createUserNotification(userId, "BuildMind has a new coaching response for you.", "ai_recommendation");

    return NextResponse.json({ success: true, data: { reasoning, answer } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Coach failed";
    const status = msg.toLowerCase().includes("limit") ? 429 : msg.includes("GROQ_API_KEY") ? 503 : 500;

    return NextResponse.json({
      success: false,
      error: msg,
      data: {
        reasoning: ["Encountering an issue...", "Falling back to default guidance..."],
        answer: msg.includes("GROQ_API_KEY")
          ? "⚠️ AI is not configured yet. Add the GROQ_API_KEY to your environment variables."
          : `BuildMind is temporarily unavailable. Your most important task right now: complete the top pending item in your project.`,
      },
    }, { status });
  }
}
