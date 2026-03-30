import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const projectId = String(body?.projectId ?? "");

    if (!userId || !projectId) {
      return NextResponse.json({ success: false, error: "userId and projectId are required" }, { status: 400 });
    }

    await enforceAndTrackAIUsage(userId);

    // Fallback when Supabase env is not configured
    if (!hasAdminEnv()) {
      return NextResponse.json({
        success: true,
        data: {
          verdict: "Analysis requires live project data. Configure Supabase to enable full analysis.",
          kill_reasons: ["No user interviews recorded", "No paying customers yet", "Assumptions unvalidated"],
          survive_reasons: ["Founder deeply understands the problem", "Clear target market defined"],
          brutal_advice: "Talk to 10 potential users before writing any more code. Every assumption you hold right now is probably wrong.",
          survival_probability: 40,
        },
      });
    }

    const supabase = createAdminClient();

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("title,description,target_users,problem,startup_stage,validation_strengths,validation_weaknesses")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (projectError) throw new Error(projectError.message);

    const { data: milestones } = await supabase
      .from("milestones")
      .select("id,title,is_completed")
      .eq("project_id", projectId);

    const milestoneIds = (milestones ?? []).map((m) => m.id);
    const { data: tasks } = milestoneIds.length
      ? await supabase.from("tasks").select("title,is_completed").in("milestone_id", milestoneIds)
      : { data: [] };

    const completedTasks = (tasks ?? []).filter((t) => t.is_completed).length;
    const totalTasks = (tasks ?? []).length;
    const completedMilestones = (milestones ?? []).filter((m) => m.is_completed).length;

    const systemPrompt = `You are a brutally honest startup advisor running a failure analysis.
Your job is to find every reason this startup could fail.
Return ONLY a JSON object with these exact keys:
- verdict (string): a 2-3 sentence honest assessment
- kill_reasons (array of 3-4 strings): specific reasons this startup will fail
- survive_reasons (array of 2-3 strings): genuine reasons it might succeed  
- brutal_advice (string): the single most important thing the founder must do NOW
- survival_probability (number 0-100): honest probability estimate`;

    const userPrompt = `Analyze this startup for failure risks:

Title: ${project.title}
Description: ${project.description ?? "Not provided"}
Target users: ${project.target_users ?? "Not specified"}
Problem: ${project.problem ?? "Not specified"}
Stage: ${project.startup_stage ?? "Idea"}
Milestones completed: ${completedMilestones}/${(milestones ?? []).length}
Tasks completed: ${completedTasks}/${totalTasks}
Known strengths: ${JSON.stringify(project.validation_strengths ?? [])}
Known weaknesses: ${JSON.stringify(project.validation_weaknesses ?? [])}

Be specific, harsh, and honest. No sugar-coating.`;

    let result = {
      verdict: "Analysis temporarily unavailable.",
      kill_reasons: ["Insufficient data to analyze"],
      survive_reasons: ["Founder took the time to analyze risks"],
      brutal_advice: "Run 10 user interviews before your next build session.",
      survival_probability: 35,
    };

    try {
      const aiResult = await groqJSON<typeof result>(systemPrompt, userPrompt);
      if (aiResult?.verdict) result = aiResult;
    } catch {
      // Try Python backend as fallback
      const backendUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000/api/v1";
      try {
        const backendRes = await fetch(`${backendUrl}/ai/break-my-startup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        });
        if (backendRes.ok) {
          const bd = await backendRes.json().catch(() => ({}));
          if (bd?.data) result = bd.data;
        }
      } catch { /* use default */ }
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Analysis failed";
    const status = msg.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
