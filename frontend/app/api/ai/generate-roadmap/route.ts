import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const projectName = String(body?.title ?? body?.project_name ?? "Startup Project");
    const idea = String(body?.idea ?? body?.idea_description ?? "");
    const targetUsers = String(body?.targetUsers ?? body?.target_users ?? "");
    const problem = String(body?.problem ?? "");
    if (!userId) return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    const prompt = `Project: ${projectName}
Idea: ${idea}
Target users: ${targetUsers}
Problem: ${problem}

Generate startup roadmap milestones exactly in this order:
Idea, Validation, MVP, Launch, Growth
Each milestone must contain 3-5 concrete tasks.`;

    const result = await groqJSON<{
      roadmap: Array<{ milestone: string; tasks: string[] }>;
    }>(
      "You are a startup execution strategist. Return JSON with key roadmap only.",
      prompt,
    );

    const fallback = [
      { milestone: "Idea", tasks: ["Define core value proposition", "Draft one-line pitch", "Identify top competitor alternatives"] },
      { milestone: "Validation", tasks: ["Interview 10 target users", "Validate top pain points", "Test willingness to pay"] },
      { milestone: "MVP", tasks: ["Scope MVP feature set", "Ship first working prototype", "Collect first user feedback"] },
      { milestone: "Launch", tasks: ["Prepare launch messaging", "Run launch campaign", "Monitor activation metrics"] },
      { milestone: "Growth", tasks: ["Define growth loop", "Run weekly experiments", "Track retention and referral"] },
    ];

    const roadmap = Array.isArray(result?.roadmap) && result.roadmap.length ? result.roadmap : fallback;
    await createUserNotification(userId, "AI roadmap generated successfully.");

    return NextResponse.json({ success: true, data: { roadmap } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Roadmap generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
