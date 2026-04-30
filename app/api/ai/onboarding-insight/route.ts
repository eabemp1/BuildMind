/**
 * app/api/ai/onboarding-insight/route.ts
 *
 * Generates a personalized brutal insight during onboarding.
 * Called once per new user — the "first impact" moment.
 * No rate limit needed (tied to authenticated user session).
 */

import { NextResponse } from "next/server";
import { groqJSON } from "@/app/api/ai/_utils";

type Insight = {
  headline: string;
  risk: string;
  action: string;
  why: string;
};

const BLOCKER_CONTEXT: Record<string, string> = {
  dont_know_what_to_do: "The founder doesn't know what to do next. They need direction and prioritization.",
  too_many_ideas: "The founder has too many ideas and can't commit. They need to pick one and cut the rest.",
  no_users_yet: "The founder has no users yet. Distribution and outreach is the core problem.",
  building_too_slow: "The founder is building too slowly. They need to ship faster and cut scope.",
  no_revenue: "The founder has users but no revenue. They need to convert or kill the product.",
  just_starting: "The founder is just starting. They need structure and a clear first step.",
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const idea    = String(body?.idea ?? "").trim().slice(0, 600);
    const stage   = String(body?.stage ?? "Idea").trim();
    const blocker = String(body?.blocker ?? "").trim();

    if (!idea) return NextResponse.json({ success: false, error: "Missing idea" }, { status: 400 });

    const blockerContext = BLOCKER_CONTEXT[blocker] ?? "The founder needs clear direction.";

    const systemPrompt = `You are a brutally honest startup advisor doing a first-session assessment of a new founder. 
Return ONLY valid JSON with exactly these keys:
{
  "headline": "One sharp sentence (max 10 words) that names their real problem — not their stated blocker",
  "risk": "1-2 sentences on the specific risk this startup faces RIGHT NOW at this stage. Be concrete.",
  "action": "The single most important thing to do in the next 48 hours. Be specific to their idea.",
  "why": "1 sentence explaining why this action is the right move now, not something else."
}

Rules:
- headline: must feel like a gut punch — something they haven't said to themselves yet
- risk and action: must be SPECIFIC to their actual idea, not generic startup advice
- action: something achievable in 48 hours, not a vague strategy
No preamble. No markdown. Only JSON.`;

    const userPrompt = `New founder assessment:
Startup idea: ${idea}
Current stage: ${stage}
Blocker context: ${blockerContext}

Give them their honest first assessment. Make it specific to "${idea.slice(0, 100)}".`;

    const fallback: Insight = {
      headline: "Your biggest risk isn't execution — it's direction.",
      risk: `At the ${stage} stage with "${idea.slice(0, 60)}...", the danger is building something technically correct but commercially irrelevant.`,
      action: "Talk to 3 potential users in the next 48 hours. Ask them what they currently use to solve this problem and what they hate about it.",
      why: "Every assumption you have about what people want is probably wrong. Real conversations fix this faster than anything else.",
    };

    try {
      const ai = await groqJSON<Insight>(systemPrompt, userPrompt);
      if (ai?.headline && ai?.action && ai?.risk && ai?.why) {
        return NextResponse.json({ success: true, data: ai });
      }
    } catch {}

    return NextResponse.json({ success: true, data: fallback });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Insight failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
