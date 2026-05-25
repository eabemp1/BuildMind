/**
 * app/api/ai/initial-analysis/route.ts
 *
 * Generates the BuildMind Initial Analysis shown when a founder first
 * lands on the Today page (or when explicitly requested).
 *
 * Returns a structured analysis with:
 * - transition state label
 * - key risks (3)
 * - immediate priorities (3)
 * - startup health score (0–100)
 * - founder pattern label
 * - suggested operating mode
 *
 * Stored in founder_memory.initial_analysis so subsequent loads don't
 * re-generate. Invalidated when stage changes.
 */

import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export type InitialAnalysis = {
  transition_state: string; // e.g. "validation-to-execution transition"
  key_risks: [string, string, string];
  immediate_priorities: [string, string, string];
  health_score: number; // 0–100
  founder_pattern: string; // e.g. "Vision-heavy / systems-light"
  operating_mode: string; // e.g. "Execution Sprint"
  generated_at: string;
  stage: string;
};

export async function POST(request: Request) {
  try {
    const userResult = await getRouteUser();
    if (!userResult?.user) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    const userId = userResult.user.id;

    const body = await request.json().catch(() => ({}));
    const projectId = String(body?.projectId ?? "").trim();
    const forceRefresh = Boolean(body?.forceRefresh);

    if (!projectId) {
      return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });
    }

    if (!hasAdminEnv()) {
      return NextResponse.json({ ok: false, error: "Admin env missing" }, { status: 500 });
    }

    const supabase = createAdminClient();

    // Check if we already have a fresh analysis (same stage, generated < 7 days ago)
    if (!forceRefresh) {
      const { data: memory } = await supabase
        .from("founder_memory")
        .select("initial_analysis")
        .eq("user_id", userId)
        .maybeSingle();

      if (memory?.initial_analysis) {
        try {
          const cached = JSON.parse(memory.initial_analysis) as InitialAnalysis;
          const age = Date.now() - new Date(cached.generated_at).getTime();
          const sevenDays = 7 * 24 * 60 * 60 * 1000;
          if (age < sevenDays) {
            return NextResponse.json({ ok: true, data: cached, cached: true });
          }
        } catch {
          // malformed — regenerate
        }
      }
    }

    // Fetch project context
    const { data: project } = await supabase
      .from("projects")
      .select("title, problem, description, target_users, startup_stage, execution_score, momentum_score, validation_strengths, validation_weaknesses")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!project) {
      return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    }

    const stage = project.startup_stage ?? "Idea";

    // Fetch recent reflections for behavioral context
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: reflections } = await supabase
      .from("reflections")
      .select("outcome, confidence, note")
      .eq("user_id", userId)
      .gte("created_at", weekAgo);

    const avgConfidence =
      reflections && reflections.length > 0
        ? reflections.reduce((s, r) => s + (r.confidence ?? 3), 0) / reflections.length
        : 3;
    const completionRate =
      reflections && reflections.length > 0
        ? Math.round(
            (reflections.filter((r) => r.outcome === "completed").length / reflections.length) * 100
          )
        : 0;

    const systemPrompt = `You are BuildMind, an AI operating system for founders.
A founder just opened their daily task. Generate a personalized startup analysis.
Return ONLY valid JSON:
{
  "transition_state": "short phrase describing their current transition (e.g. 'idea-to-validation transition')",
  "key_risks": ["risk 1", "risk 2", "risk 3"],
  "immediate_priorities": ["priority 1", "priority 2", "priority 3"],
  "health_score": <number 0-100>,
  "founder_pattern": "short label for their pattern (e.g. 'Vision-heavy / systems-light')",
  "operating_mode": "suggested mode (e.g. 'Validation Sprint', 'Execution Sprint', 'Focus Mode')"
}
Be specific to their startup. No generic advice. Each item max 12 words.
No preamble. No markdown. Only JSON.`;

    const userPrompt = [
      `Startup: ${project.title}`,
      project.problem ? `Problem: ${project.problem}` : "",
      project.description ? `Description: ${project.description}` : "",
      project.target_users ? `Target users: ${project.target_users}` : "",
      `Stage: ${stage}`,
      project.execution_score ? `Execution score: ${project.execution_score}` : "",
      reflections?.length
        ? `Recent reflections: ${reflections.length} this week, avg confidence ${avgConfidence.toFixed(1)}, completion rate ${completionRate}%`
        : "",
      project.validation_weaknesses?.length
        ? `Known weaknesses: ${(project.validation_weaknesses as string[]).slice(0, 2).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    // Fallback analysis
    let analysis: InitialAnalysis = {
      transition_state: `${stage.toLowerCase()}-to-execution transition`,
      key_risks: [
        "Overbuilding before distribution certainty",
        "Lack of repeatable feedback loops",
        "Founder context switching",
      ],
      immediate_priorities: [
        "Tighten core ICP",
        "Increase shipping velocity",
        "Reduce execution fragmentation",
      ],
      health_score: Math.min(
        95,
        Math.max(
          20,
          50 + (project.execution_score ?? 0) * 0.3 + (project.momentum_score ?? 0) * 0.2
        )
      ),
      founder_pattern: "Vision-heavy / systems-light",
      operating_mode: stage === "Idea" || stage === "Validation" ? "Validation Sprint" : "Execution Sprint",
      generated_at: new Date().toISOString(),
      stage,
    };

    try {
      const ai = await groqJSON<Omit<InitialAnalysis, "generated_at" | "stage">>(
        systemPrompt,
        userPrompt
      );

      if (
        ai?.transition_state &&
        Array.isArray(ai.key_risks) &&
        ai.key_risks.length >= 3 &&
        Array.isArray(ai.immediate_priorities) &&
        ai.immediate_priorities.length >= 3 &&
        typeof ai.health_score === "number" &&
        ai.founder_pattern &&
        ai.operating_mode
      ) {
        analysis = {
          ...ai,
          key_risks: [ai.key_risks[0], ai.key_risks[1], ai.key_risks[2]] as [string, string, string],
          immediate_priorities: [
            ai.immediate_priorities[0],
            ai.immediate_priorities[1],
            ai.immediate_priorities[2],
          ] as [string, string, string],
          health_score: Math.min(100, Math.max(0, Math.round(ai.health_score))),
          generated_at: new Date().toISOString(),
          stage,
        };
      }
    } catch {
      // use fallback
    }

    // Persist to founder_memory
    await supabase
      .from("founder_memory")
      .upsert(
        {
          user_id: userId,
          initial_analysis: JSON.stringify(analysis),
        },
        { onConflict: "user_id" }
      );

    return NextResponse.json({ ok: true, data: analysis, cached: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "initial-analysis failed";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
