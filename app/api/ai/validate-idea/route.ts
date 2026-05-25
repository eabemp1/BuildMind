import { NextResponse } from "next/server";
import { createUserNotification, enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime     = "nodejs";
export const dynamic     = "force-dynamic";
export const maxDuration = 60; // 5-agent pipeline can take up to ~45 s on provider fallback

import { parseStartupIdea, runAgentPipeline, generatePivots } from "@/lib/agents";
import { withAgentConcurrencyLimit } from "@/lib/server/concurrency";
import { computeViabilityScore, computeViabilityBreakdown } from "@/lib/scoring";

export async function POST(request: Request) {
  try {
    const routeUser = await getRouteUser();
    if (!routeUser) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = routeUser.userId;

    const rawBody = await request.json().catch(() => ({}));
    const { z } = await import("zod");
    const bodySchema = z.object({
      idea:        z.string().max(1000).optional(),
      targetUsers: z.string().max(300).optional(),
      problem:     z.string().max(500).optional(),
      stage:       z.string().max(50).optional(),
    });
    const parsedBody = bodySchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }
    const body = parsedBody.data;
    const idea = String(body?.idea ?? "").trim();
    const targetUsers = String(body?.targetUsers ?? "").trim();
    const problem = String(body?.problem ?? "").trim();
    const stage = String(body?.stage ?? "Idea").trim();

    await enforceAndTrackAIUsage(userId, routeUser.plan);

    // ── Stage 0: Input Parser ─────────────────────────────────────────────
    // Convert free-text to structured schema before running agents
    const parsed = await parseStartupIdea(
      idea || `${problem} — targeting ${targetUsers}`
    );

    // ── Stage 1: 5-Agent Pipeline ─────────────────────────────────────────
    // Run all agents in parallel using the parsed schema
    // C2 FIX: Concurrency limiter prevents 5-agent fan-out bursts
    const agentPipeline = await withAgentConcurrencyLimit(() => runAgentPipeline({
      idea: idea || parsed.problem,
      problem: parsed.problem,
      targetUsers: parsed.target_customer || targetUsers,
      solution: parsed.solution,
      stage,
      competitors: [],  // No competitors for idea-only validation (no project context)
    }));

    const signals = agentPipeline.signal_summary;

    // ── Viability Score ───────────────────────────────────────────────────
    // Estimate monetization clarity from the parsed schema
    const monetizationClarity =
      parsed.monetization && parsed.monetization !== "Not specified" ? 65 : 30;

    const viabilityResult = computeViabilityScore(signals, monetizationClarity);
    const breakdownEntries = computeViabilityBreakdown(viabilityResult.breakdown);

    // ── Pivot Engine ──────────────────────────────────────────────────────
    const pivots = await generatePivots(
      {
        idea: idea || parsed.problem,
        problem: parsed.problem,
        targetUsers: parsed.target_customer || targetUsers,
        solution: parsed.solution,
        stage,
        competitors: [],
      },
      signals,
      viabilityResult.viability_score,
    );

    // ── Legacy format (strengths / weaknesses / suggestions) ─────────────
    // Preserved for backwards compatibility with BreakMyStartup2.tsx
    // and any other component reading this response shape.
    let strengths: string[] = [];
    let weaknesses: string[] = [];
    let suggestions: string[] = [];

    // Derive from agent outputs — no extra Groq call needed
    strengths = [
      ...(agentPipeline.market?.demand_signals?.slice(0, 2) ?? []),
      ...(agentPipeline.competitor?.differentiation_opportunities?.slice(0, 1) ?? []),
    ].filter(Boolean).slice(0, 3);

    weaknesses = [
      ...(agentPipeline.risk?.top_risks?.slice(0, 2).map(r => r.description) ?? []),
      ...(agentPipeline.sentiment?.willingness_to_pay_signal === "unlikely"
        ? ["Willingness-to-pay signal is weak — needs validation"]
        : []),
    ].filter(Boolean).slice(0, 3);

    suggestions = [
      ...(agentPipeline.risk?.top_risks?.slice(0, 2).map(r => r.mitigation) ?? []),
      ...(pivots.slice(0, 1).map(p => `Consider pivot: ${p.title} — ${p.key_change}`)),
    ].filter(Boolean).slice(0, 3);

    // Fallback to Groq-generated if agents returned empty arrays
    if (strengths.length === 0 || weaknesses.length === 0) {
      try {
        const fallback = await groqJSON<{
          strengths: string[];
          weaknesses: string[];
          suggestions: string[];
        }>(
          "You are a startup validation coach. Return JSON with strengths, weaknesses, suggestions arrays.",
          `Startup idea: ${idea}\nTarget users: ${targetUsers}\nProblem: ${problem}\nProvide concise validation feedback.`,
        );
        if (Array.isArray(fallback?.strengths) && fallback.strengths.length > 0) {
          strengths = fallback.strengths.map(String);
          weaknesses = (fallback.weaknesses ?? []).map(String);
          suggestions = (fallback.suggestions ?? []).map(String);
        }
      } catch { /* use what we have */ }
    }

    await createUserNotification(userId, "AI validation feedback generated.", "ai_recommendation");

    return NextResponse.json({
      success: true,
      data: {
        // ── Legacy fields (unchanged) ──
        strengths,
        weaknesses,
        suggestions,

        // ── New: parsed schema ──
        parsed_schema: parsed,

        // ── New: viability scoring ──
        viability_score: viabilityResult.viability_score,
        viability_confidence: viabilityResult.confidence,
        viability_verdict: viabilityResult.verdict,
        viability_verdict_reason: viabilityResult.verdict_reason,
        viability_breakdown: viabilityResult.breakdown,
        viability_breakdown_labelled: breakdownEntries,

        // ── New: agent signals ──
        signal_summary: {
          demand_score: signals.demand_score,
          competition_score: signals.competition_score,
          timing_score: signals.timing_score,
          uniqueness_score: signals.uniqueness_score,
          risk_score: signals.risk_score,
          overall_confidence: signals.overall_confidence,
        },

        // ── New: agent outputs (for rich UI) ──
        market_signals: agentPipeline.market?.demand_signals ?? [],
        competitor_gaps: signals.competitor_gaps,
        pain_points: signals.all_pain_points,
        opportunities: signals.all_opportunities,
        risks: signals.all_risks,

        // ── New: pivots ──
        pivots,

        // ── Meta ──
        agent_statuses: agentPipeline.agent_statuses,
        pipeline_duration_ms: agentPipeline.duration_ms,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Validation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
