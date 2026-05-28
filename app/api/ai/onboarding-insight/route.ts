/**
 * app/api/ai/onboarding-insight/route.ts
 *
 * Generates a personalized brutal insight during onboarding.
 * Called once per new user — the "first impact" moment.
 *
 * Security:
 *   - Requires authenticated session (401 if not logged in)
 *   - Usage tracked against monthly limit (same as all other AI routes)
 *   - One natural daily cap from the shared monthly limit system
 */

import { NextResponse } from "next/server";
import { groqJSON, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { classifyFounderArchetype } from "@/lib/founderArchetype";
import { buildKnowledgeBaseContext, searchFounderKnowledgeBase } from "@/lib/founderKnowledgeBase";
import { findMatchingPatterns } from "@/lib/founderPatternLibrary";

type Insight = {
  headline: string;
  risk: string;
  action: string;
  why: string;
  tags?: string[];
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
  // ── Auth check ─────────────────────────────────────────────────────────────
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Usage enforcement ──────────────────────────────────────────────────────
  try {
    await enforceAndTrackAIUsage(routeUser.userId, routeUser.plan);
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json(
        { success: false, error: msg, upgradeUrl: "/upgrade" },
        { status: 429 },
      );
    }
  }

  try {
    const body = await request.json().catch(() => ({}));
    const idea    = String(body?.idea ?? "").trim().slice(0, 600);
    const stage   = String(body?.stage ?? "Idea").trim();
    const blocker = String(body?.blocker ?? "").trim();

    if (!idea) return NextResponse.json({ success: false, error: "Missing idea" }, { status: 400 });

    const blockerContext = BLOCKER_CONTEXT[blocker] ?? "The founder needs clear direction.";
    const roughTags = Array.from(new Set(
      idea
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length > 3)
        .slice(0, 8),
    ));
    const matchedPatterns = findMatchingPatterns(idea, stage, blocker, roughTags);
    const patternContext = matchedPatterns.length
      ? `\nKnown founder patterns:\n${matchedPatterns.map((pattern) => `- ${pattern.pattern}: ${pattern.lesson}`).join("\n")}`
      : "";
    const kbMatches = await searchFounderKnowledgeBase(idea, stage, undefined, 0);
    const knowledgeContext = buildKnowledgeBaseContext(kbMatches);

    const systemPrompt = `You are a brutally honest startup advisor doing a first-session assessment of a new founder. 
Return ONLY valid JSON with exactly these keys:
{
  "headline": "One sharp sentence (max 10 words) that names their real problem — not their stated blocker",
  "risk": "1-2 sentences on the specific risk this startup faces RIGHT NOW at this stage. Be concrete.",
  "action": "The single most important thing to do in the next 48 hours. Be specific to their idea.",
  "why": "1 sentence explaining why this action is the right move now, not something else.",
  "tags": ["3-6 canonical lowercase tags describing domain, stage risk, and behaviour"]
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
${patternContext}
${knowledgeContext}

Give them their honest first assessment. Make it specific to "${idea.slice(0, 100)}".`;

    const result = await groqJSON<Insight>(systemPrompt, userPrompt);
    const tags = Array.isArray(result.tags) ? result.tags.filter((tag) => typeof tag === "string").slice(0, 6) : roughTags.slice(0, 6);
    classifyFounderArchetype(idea, stage, blocker, routeUser.userId, tags).catch((err) => {
      console.error("[onboarding-insight] archetype classification failed:", err);
    });

    return NextResponse.json({
      success: true,
      data: {
        headline: result.headline ?? "Your first assumption is probably wrong.",
        risk:     result.risk     ?? "Every day without user feedback is a day building on assumptions.",
        action:   result.action   ?? "Talk to one person who has this problem in the next 24 hours.",
        why:      result.why      ?? "Real conversations are worth more than a week of planning.",
        tags,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Onboarding insight failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
