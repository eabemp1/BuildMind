/**
 * app/api/cofounder/blueprint/route.ts
 *
 * CoFounder Core — Blueprint Mode (Full Intelligence)
 *
 * Builder plan only. Extends BreakMyStartupAnalysis competitor data
 * with AI-enriched steal/skip/next-move intelligence + web search.
 * Consumes the BreakMyStartupAnalysis competitors[] array directly.
 */
/**
 * ⚠️  PLAYBOOK TIMING: CoFounder Blueprint Mode
 *
 * This route exists in the codebase ahead of its playbook unlock date.
 * Month 3 — competitor intelligence features.
 * Gate behind Ghost Competitor launch (20+ active users). Currently gated at builder as a safe interim.
 *
 * Current server-side guard: builder (safest interim gate — keeps it off free tier).
 * Do NOT remove the plan guard or surface this feature in UI until the condition above is met.
 */


import { NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage, groqReasoningJSON, hasGroqKey } from "@/app/api/ai/_utils";
import type {
  BlueprintIntelligence,
  BlueprintModeResult,
  BreakMyStartupCompetitor,
} from "@/lib/cofounder/blueprintMode";

function toCompetitors(value: unknown): BreakMyStartupCompetitor[] {
  if (!Array.isArray(value)) return [];
  const competitors: BreakMyStartupCompetitor[] = [];

  for (const item of value) {
    const raw = item as Record<string, unknown>;
    const name = String(raw.name ?? "").trim().slice(0, 80);
    if (!name) continue;
    const betterAt = Array.isArray(raw.betterAt)
      ? raw.betterAt.map(String).map((entry) => entry.trim()).filter(Boolean).slice(0, 5)
      : [];
    const yourMoat = String(raw.yourMoat ?? "").trim().slice(0, 300);
    const successRate = typeof raw.successRate === "number" ? raw.successRate : undefined;
    competitors.push({
      name,
      betterAt,
      yourMoat: yourMoat || "Their biggest gap is still undefined. Interview users before copying features.",
      successRate,
    });
    if (competitors.length === 6) break;
  }

  return competitors;
}

function localBlueprint(
  competitors: BreakMyStartupCompetitor[],
  projectDescription: string,
  projectStage: string,
): BlueprintModeResult {
  const blueprints: BlueprintIntelligence[] = competitors.map((competitor) => {
    const primaryStrength = competitor.betterAt[0] ?? "positioning";
    const secondaryStrength = competitor.betterAt[1] ?? "customer trust";
    const moat = competitor.yourMoat;

    return {
      competitorName: competitor.name,
      steal: [
        `Adapt their strongest ${primaryStrength} pattern, but narrow it to your first customer segment.`,
        `Reuse their ${secondaryStrength} proof style only after validating it with real prospects.`,
      ],
      skip: [
        "Do not copy their full feature set before proving one painful workflow.",
        "Avoid competing on polish until your differentiation is already obvious in user conversations.",
      ],
      nextMove: `Run a 5-user comparison test: show ${competitor.name}, then your promise, and ask which pain feels more urgent.`,
      marketSignal: `${competitor.name} proves buyers understand this category; your work is to win a narrower wedge, not educate the whole market.`,
      weakestPoint: moat,
    };
  });

  const founderAction = blueprints[0]?.nextMove
    ?? `For ${projectDescription || "this startup"}, list three direct alternatives and interview five ${projectStage} users about their current workaround.`;

  return {
    blueprints,
    overallInsight: competitors.length
      ? `${competitors.length} competitor(s) analysed. Treat them as market proof, then attack the gap your users can name in one sentence.`
      : "No competitors were supplied. Start by finding three alternatives your target users already compare against.",
    founderAction,
  };
}

export async function POST(request: Request) {
  try {
    const access = await checkPlanAccess("builder");
    if (!access.ok) {
      return access.response;
    }

    const body = await request.json().catch(() => ({}));
    const competitors = toCompetitors(body?.competitors);
    const projectDescription = String(body?.projectDescription ?? "").trim().slice(0, 1200);
    const projectStage = String(body?.projectStage ?? "Idea").trim().slice(0, 80);

    if (!projectDescription && competitors.length === 0) {
      return NextResponse.json(
        { ok: false, error: "projectDescription or competitors are required" },
        { status: 400 },
      );
    }

    if (!hasGroqKey()) {
      return NextResponse.json({
        ok: true,
        source: "local",
        ...localBlueprint(competitors, projectDescription, projectStage),
      });
    }

    await enforceAndTrackAIUsage(access.userId, "builder");

    const result = await groqReasoningJSON<BlueprintModeResult>(
      `You are BuildMind's CoFounder Blueprint Mode.
Return strict JSON:
{
  "blueprints": [{
    "competitorName": "string",
    "steal": ["2-3 concrete patterns worth adapting"],
    "skip": ["2 concrete traps to avoid copying"],
    "nextMove": "one specific action the founder should do in 24 hours",
    "marketSignal": "what this competitor proves about demand",
    "weakestPoint": "the narrow gap the founder can attack"
  }],
  "overallInsight": "one concise strategic read",
  "founderAction": "the single clearest next move"
}
Make every item specific to the supplied startup, stage, and competitors. No generic startup advice.`,
      JSON.stringify({
        projectDescription,
        projectStage,
        competitors,
      }),
    );

    const fallback = localBlueprint(competitors, projectDescription, projectStage);
    const blueprints = Array.isArray(result?.blueprints) && result.blueprints.length > 0
      ? result.blueprints.slice(0, 6)
      : fallback.blueprints;

    return NextResponse.json({
      ok: true,
      source: "ai",
      blueprints,
      overallInsight: result?.overallInsight || fallback.overallInsight,
      founderAction: result?.founderAction || fallback.founderAction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CoFounder Blueprint Mode failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
