/**
 * app/api/cofounder/validation-action/route.ts
 *
 * CoFounder Core — Validation Action Generator
 *
 * Builder plan only. Generates personalised outreach templates for a given idea:
 *   - Cold DM template (one specific target persona)
 *   - Community question (for Reddit / Discord / X)
 *   - One-liner problem hypothesis
 *   - Suggested channels with reasoning
 *
 * Migrated from Anthropic (claude-sonnet-4-5) → Groq (llama-3.3-70b-versatile)
 */

import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";

type ValidationActionResult = {
  coldDmTemplate: string;
  communityQuestion: string;
  problemHypothesis: string;
  suggestedChannels: string[];
  targetPersonaDescription: string;
};

export async function POST(request: Request) {

  // ── Server-side plan enforcement (builder required) ───────────────────────
  const planCheck = await checkPlanAccess("builder");
  if (!planCheck.ok) return planCheck.response;

  try {
    const body = await request.json().catch(() => ({}));
    const userId = String(body?.userId ?? "").trim();
    const ideaTitle = String(body?.ideaTitle ?? "").trim();
    const ideaDescription = String(body?.ideaDescription ?? "").trim();
    const targetUser = String(body?.targetUser ?? "").trim();
    const problemStatement = String(body?.problemStatement ?? "").trim();
    const stage = String(body?.stage ?? "idea").trim();

    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    const systemPrompt = `You are BuildMind's Validation Receipt engine. A founder needs outreach templates to collect real human validation before building.

Return ONLY valid JSON:
{
  "coldDmTemplate": "A specific, warm 3-4 sentence DM that does NOT pitch the product. It asks about their experience with the problem. It includes a placeholder [Name] at the start. It ends with a simple yes/no question.",
  "communityQuestion": "A question for Reddit/Discord/Twitter that sounds like genuine curiosity, not a pitch. Under 50 words. Specific enough that people with the problem will self-identify.",
  "problemHypothesis": "One sentence. Format: '[Target user] struggle with [specific problem] and currently [how they cope], which costs them [time/money/stress].'",
  "suggestedChannels": ["channel name — reason it fits this target user"],
  "targetPersonaDescription": "2-3 sentences describing exactly who to send the DM to and where to find them."
}`;

    const userPrompt = `Idea: ${ideaTitle}
Description: ${ideaDescription}
Target user: ${targetUser}
Problem: ${problemStatement}
Stage: ${stage}

Generate validation outreach templates.`;

    const result = await groqJSON<ValidationActionResult>(systemPrompt, userPrompt);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Validation action failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
