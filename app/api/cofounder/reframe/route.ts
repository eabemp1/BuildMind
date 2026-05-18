/**
 * app/api/cofounder/reframe/route.ts
 *
 * CoFounder Core — Competitor Reframe API
 *
 * Builder plan required — enforced server-side via checkPlanAccess.
 * (Month 3: will move to operator tier when Ghost Competitor ships)
 *
 * ⚠️  PLAYBOOK TIMING: Competitor Reframe
 * Month 3 — part of Ghost Competitor / operator tier.
 * Move guard to operator when Operator tier activates at Day 90 (Playbook §10).
 *
 * Migrated from Anthropic (claude-sonnet-4-5 + web_search) → Groq (openai/gpt-oss-120b via fast chain)
 * Note: web search removed — context is built from founder-provided data instead.
 * Re-enable web search when Operator tier ships with Anthropic key.
 */

import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";

type ReframeResult = {
  theirGap: string;
  yourDifferentiator: string;
  marketReframe: string;
  oneTask: string;
};

export async function POST(request: Request) {

  // ── Server-side plan enforcement (builder required) ───────────────────────
  const planCheck = await checkPlanAccess("builder");
  if (!planCheck.ok) return planCheck.response;

  try {
    const body = await request.json().catch(() => ({}));

    // Use the session-verified userId — do NOT trust body.userId.
    const userId = planCheck.userId;
    const competitorUrl = String(body?.competitorUrl ?? "").trim();
    const competitorName = String(body?.competitorName ?? "").trim();
    const projectDescription = String(body?.projectDescription ?? "").trim();
    const projectStage = String(body?.projectStage ?? "idea").trim();
    const validationReceipts = Array.isArray(body?.validationReceipts) ? body.validationReceipts : [];
    const founderMemoryContext = body?.founderMemoryContext ?? null;

    if (!competitorUrl && !competitorName) return NextResponse.json({ error: "competitorUrl or competitorName required" }, { status: 400 });

    await enforceAndTrackAIUsage(userId);

    // Build project context from Supabase if not provided
    let projectContextStr = projectDescription;
    if (hasAdminEnv() && !projectDescription) {
      try {
        const supabase = createAdminClient();
        const { data: project } = await supabase
          .from("projects")
          .select("title, description, problem, target_users, startup_stage")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (project) {
          projectContextStr = `${project.title}: ${project.description ?? ""}. Problem: ${project.problem ?? ""}. Target users: ${project.target_users ?? ""}. Stage: ${project.startup_stage ?? projectStage}.`;
        }
      } catch {
        // Use provided description
      }
    }

    // Build receipt context
    const receiptLines = validationReceipts
      .filter((r: { problemConfirmed: boolean }) => r.problemConfirmed)
      .slice(0, 5)
      .map((r: { personName: string; quote: string; channel: string }) => `- ${r.personName} (${r.channel}): "${r.quote}"`)
      .join("\n");

    // Build founder memory context
    const memoryStr = founderMemoryContext
      ? `\nFounder profile: personality=${(founderMemoryContext.personality_tags ?? []).join(", ")}, avoids=${(founderMemoryContext.avoidance_zones ?? []).join(", ")}`
      : "";

    const systemPrompt = `You are the CoFounder Core Competitor Reframe engine inside BuildMind.

A founder just discovered a competitor and is starting to spiral. Your job is to perform REAL analysis — not generic encouragement — and return four things in JSON:

1. theirGap — what this competitor is specifically NOT solving for the founder's target user. Be specific. "They don't serve X" beats "they have weaknesses."
2. yourDifferentiator — the founder's unique edge, pulled from their project description and stage. Not "focus on quality" — actually specific.
3. marketReframe — recontextualise the competitor as PROOF the market exists. e.g. "They have 50k users and zero support for [specific user type]. That's your entire market."
4. oneTask — ONE concrete thing to do in the next 20 minutes. Not a strategy. Not a list. One action.
${receiptLines ? `\nThe founder has real validation receipts — use these in your response:\n${receiptLines}` : ""}
${memoryStr}

Return ONLY valid JSON — no markdown, no preamble:
{
  "theirGap": "string",
  "yourDifferentiator": "string",
  "marketReframe": "string",
  "oneTask": "string"
}`;

    const userPrompt = `My project: ${projectContextStr}

Competitor: ${competitorName || competitorUrl}
${competitorUrl ? `URL: ${competitorUrl}` : ""}

Give me the four-part reframe.`;

    const result = await groqJSON<ReframeResult>(systemPrompt, userPrompt);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Reframe failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
