import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqChat, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const projectId = String(body?.projectId ?? "").trim();
    const message = String(body?.message ?? "").trim();
    const history = Array.isArray(body?.messages)
      ? (body.messages as { role?: string; content?: string }[])
          .map((m) => ({ role: (m?.role === "assistant" ? "assistant" : "user") as "user" | "assistant", content: String(m?.content ?? "").trim() }))
          .filter((m) => m.content)
          .slice(-10) // last 10 messages for context
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

      // Infer stage from actual milestone/task completion to avoid stale DB values
      const inferredStage = inferStage(completedTasks, totalTasks, completedMilestones, (milestones ?? []).length);

      if (project) {
        stage = inferredStage || project.startup_stage || "Idea";
        projectContext = `
Project: ${project.title}
Stage: ${stage}
Problem being solved: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}
Description: ${project.description ?? "Not specified"}
Milestones: ${(milestones ?? []).map((m) => `${m.title} (${m.is_completed ? "complete" : "in progress"})`).join(", ")}
Tasks: ${completedTasks}/${totalTasks} completed
Known strengths: ${(project.validation_strengths ?? []).join(", ") || "None logged yet"}
Known weaknesses: ${(project.validation_weaknesses ?? []).join(", ") || "None logged yet"}`;
      }
    }

    const systemPrompt = `You are BuildMind — a brutally honest AI execution coach for founders. You are NOT a cheerleader.

Your job is to:
1. Give ONE specific, actionable thing to do RIGHT NOW
2. Call out what the founder is avoiding or getting wrong
3. Never give generic advice — always tie it to their specific stage and data
4. Keep responses under 200 words — dense and direct

${projectContext ? `FOUNDER'S REAL DATA:\n${projectContext}` : ""}

Rules:
- If they ask what to do → give ONE specific action, not a list
- If their accountability is low → call it out directly
- If they're stuck in the same stage too long → say it
- Never say "Great question!" or use filler phrases
- End every response with one concrete next step they can do in the next hour`;

    // Add the user's current message to history
    const messagesForGroq = [...history, { role: "user" as const, content: message }];

    const reply = await groqChat(systemPrompt, messagesForGroq);

    await createUserNotification(userId, "BuildMind has a new coaching response for you.", "ai_recommendation");

    return NextResponse.json({ success: true, data: { reply } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Coach failed";
    const status = msg.toLowerCase().includes("limit") ? 429 : msg.includes("GROQ_API_KEY") ? 503 : 500;

    // Return a specific error message so the UI can show it, not a generic fallback
    return NextResponse.json({
      success: false,
      error: msg,
      // Include a minimal fallback reply so the UI doesn't break
      data: {
        reply: msg.includes("GROQ_API_KEY")
          ? "⚠️ AI is not configured yet. Ask Emma to add the GROQ_API_KEY to Vercel environment variables."
          : `BuildMind is temporarily unavailable: ${msg.slice(0, 100)}. Your most important task right now: complete the top pending item in your project.`
      }
    }, { status });
  }
}

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
