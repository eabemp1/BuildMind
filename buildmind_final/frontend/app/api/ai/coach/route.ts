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
                "BuildMini recommends: interview 5 target users, capture their top 3 pain points, and update your roadmap accordingly.",
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

    const callBackendCoach = async () => {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
      const response = await fetch(`${baseUrl}/ai/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          message,
          question: message,
          project: {
            title: project?.title ?? "",
            description: project?.description ?? "",
            target_users: project?.target_users ?? "",
            problem: project?.problem ?? "",
          },
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Backend AI provider failed");
      }
      const payload = await response.json().catch(() => ({}));
      const reply = payload?.data?.message;
      return typeof reply === "string" ? reply : null;
    };

    if (isChatRequest) {
      const formattedHistory = messages
        .slice(-8)
        .map((entry: { role: string; content: string }) => `${entry.role === "assistant" ? "Assistant" : "User"}: ${entry.content}`)
        .join("\n");

      let reply = "BuildMini suggests focusing on your next milestone task and validating with users.";
      try {
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
        if (typeof result?.reply === "string") reply = result.reply;
      } catch {
        const backendReply = await callBackendCoach().catch(() => null);
        if (backendReply) reply = backendReply;
      }
      await createUserNotification(userId, "New BuildMini reply available.", "ai_recommendation");
      return NextResponse.json({ success: true, data: { reply } });
    }

    let advice: string[] = [
      "Interview at least 5 target users this week.",
      "Prioritize a single activation metric for your MVP.",
      "Ship one milestone task before expanding scope.",
      "Summarize user feedback into a weekly action list.",
    ];
    try {
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

      if (Array.isArray(result?.advice)) {
        advice = result.advice.map(String);
      }
    } catch {
      const backendReply = await callBackendCoach().catch(() => null);
      if (backendReply) {
        advice = backendReply
          .split("\n")
          .map((line) => line.replace(/^[\-\*\d\.\)\s]+/, "").trim())
          .filter(Boolean)
          .slice(0, 4);
      }
    }
    await createUserNotification(userId, "New BuildMini recommendation available.", "ai_recommendation");
    return NextResponse.json({ success: true, data: { advice } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Coach generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
