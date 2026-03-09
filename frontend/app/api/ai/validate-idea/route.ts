import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const idea = String(body?.idea ?? "");
    const targetUsers = String(body?.targetUsers ?? "");
    const problem = String(body?.problem ?? "");
    if (!userId) return NextResponse.json({ success: false, error: "userId is required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    const result = await groqJSON<{
      strengths: string[];
      weaknesses: string[];
      suggestions: string[];
    }>(
      "You are a startup validation coach. Return JSON with strengths, weaknesses, suggestions arrays.",
      `Startup idea: ${idea}
Target users: ${targetUsers}
Problem: ${problem}
Provide concise validation feedback.`,
    );

    await createUserNotification(userId, "AI validation feedback generated.", "ai_recommendation");

    return NextResponse.json({
      success: true,
      data: {
        strengths: result?.strengths ?? [],
        weaknesses: result?.weaknesses ?? [],
        suggestions: result?.suggestions ?? [],
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Validation failed" },
      { status: 500 },
    );
  }
}
