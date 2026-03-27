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

    let strengths: string[] = [
      "Clear problem framing.",
      "Target audience is definable.",
      "Solution direction is understandable.",
    ];
    let weaknesses: string[] = [
      "Validation data is still limited.",
      "Primary user pain intensity is not confirmed.",
    ];
    let suggestions: string[] = [
      "Interview at least 5 target users this week.",
      "Test willingness to pay with a simple landing page.",
      "Define one primary success metric before building.",
    ];
    try {
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
      strengths = Array.isArray(result?.strengths) ? result.strengths.map(String) : strengths;
      weaknesses = Array.isArray(result?.weaknesses) ? result.weaknesses.map(String) : weaknesses;
      suggestions = Array.isArray(result?.suggestions) ? result.suggestions.map(String) : suggestions;
    } catch {
      // keep fallback
    }

    await createUserNotification(userId, "AI validation feedback generated.", "ai_recommendation");

    return NextResponse.json({
      success: true,
      data: { strengths, weaknesses, suggestions },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
