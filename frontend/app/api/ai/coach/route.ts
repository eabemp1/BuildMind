import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const projectId = String(body?.projectId ?? "");
    const message = String(body?.message ?? "").trim();
    const messages = Array.isArray(body?.messages)
      ? body.messages
          .map((item: { role?: string; content?: string }) => ({
            role: item?.role === "assistant" ? "assistant" : "user",
            content: String(item?.content ?? ""),
          }))
          .filter((item: { content: string }) => item.content)
      : [];
    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId are required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId);
    const isChatRequest = Boolean(message);
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({
        success: true,
        data: isChatRequest
          ? {
              reply:
                "Focus this week on validating demand: interview 5 target users, capture the top 3 pain points, and update your roadmap accordingly.",
            }
          : {
              advice: [
                "Interview at least 5 target users this week.",
                "Prioritize one measurable activation metric.",
                "Ship one milestone task before adding new scope.",
                "Collect and summarize user feedback after each release.",
              ],
            },
      });
    }

    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("title,description,target_users,problem")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();
    if (projectError) throw new Error(projectError.message);

    const { data: milestones } = await supabase
      .from("milestones")
      .select("id,title")
      .eq("project_id", projectId)
      .order("order_index", { ascending: true });
    const milestoneIds = (milestones ?? []).map((m) => m.id);

    const { data: tasks } = milestoneIds.length
      ? await supabase.from("tasks").select("title,is_completed,milestone_id").in("milestone_id", milestoneIds)
      : { data: [] };

    const completed = (tasks ?? []).filter((t) => t.is_completed).length;
    const total = (tasks ?? []).length;

    if (isChatRequest) {
      const formattedHistory = messages
        .slice(-8)
        .map((entry: { role: string; content: string }) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
        .join("\n");

      const result = await groqJSON<{ reply: string }>(
        "You are a pragmatic startup execution coach. Return JSON with a single reply string.",
        `Project title: ${project.title}
Description: ${project.description ?? ""}
Target users: ${project.target_users ?? ""}
Problem: ${project.problem ?? ""}
Milestones: ${(milestones ?? []).map((m) => m.title).join(", ")}
Task completion: ${completed}/${Math.max(1, total)}
Recent conversation:
${formattedHistory || "No previous messages."}

User message: ${message}

Respond with a concise, actionable coaching reply.`,
      );
      const reply = typeof result?.reply === "string" ? result.reply : "Focus on the next milestone task and validate with users.";
      await createUserNotification(userId, "New AI coach reply available.", "ai_recommendation");
      return NextResponse.json({ success: true, data: { reply } });
    }

    const result = await groqJSON<{ advice: string[] }>(
      "You are a pragmatic startup execution coach. Return JSON with advice array only.",
      `Project title: ${project.title}
Description: ${project.description ?? ""}
Target users: ${project.target_users ?? ""}
Problem: ${project.problem ?? ""}
Milestones: ${(milestones ?? []).map((m) => m.title).join(", ")}
Task completion: ${completed}/${Math.max(1, total)}
Give 4 actionable coaching bullets.`,
    );

    const advice = Array.isArray(result?.advice) ? result.advice.map(String) : [];
    await createUserNotification(userId, "New AI coach recommendation available.", "ai_recommendation");
    return NextResponse.json({ success: true, data: { advice } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coach generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
