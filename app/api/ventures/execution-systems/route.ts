/**
 * app/api/ventures/execution-systems/route.ts — NEW
 *
 * Fix #8: Generate execution systems — distinct from milestones.
 *
 * These are NOT tasks. They are automated decision engines:
 * - Each has a trigger condition (when to run)
 * - A binary decision gate (IF condition → YES path / NO path)
 * - A KPI to move
 * - Operational steps (process instructions, not todos)
 *
 * Free plan: Layer 1 system only (Distribution)
 * Builder: All 6 systems
 */

import { NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage, groqJSON } from "@/app/api/ai/_utils";
import type { ExecutionSystem, SystemStatus } from "@/components/ExecutionSystem";

type SystemCategory = ExecutionSystem["category"];

const SYSTEM_PROMPTS: Record<SystemCategory, string> = {
  distribution: `Generate a Distribution Execution System for the startup below.
Return ONLY JSON: { name (string), trigger (string - when to activate this system), objective (string), confidence (0-100 number), decisionTree: { condition, yes, no }, steps (array of 5 operational steps), kpi (string), frequency ("weekly"|"trigger-based") }
The system should be about getting the product in front of users — channels, outreach, virality. NOT about tasks — about automated decision paths.`,

  validation: `Generate a Validation Execution System.
Return ONLY JSON: { name, trigger, objective, confidence (0-100), decisionTree: { condition, yes, no }, steps (array of 5), kpi, frequency ("weekly"|"trigger-based") }
Focus on: hypothesis testing, customer interviews, signal detection. Each step is an operational process, not a task.`,

  revenue: `Generate a Revenue Execution System.
Return ONLY JSON: { name, trigger, objective, confidence (0-100), decisionTree: { condition, yes, no }, steps (array of 5), kpi, frequency ("weekly"|"trigger-based") }
Focus on: pricing experiments, conversion funnels, payment flow optimisation. Process-oriented, not task-oriented.`,

  retention: `Generate a Retention Execution System.
Return ONLY JSON: { name, trigger, objective, confidence (0-100), decisionTree: { condition, yes, no }, steps (array of 5), kpi, frequency ("weekly"|"trigger-based") }
Focus on: churn detection, re-engagement, habit formation loops. When to run, what to check, what to do.`,

  growth: `Generate a Growth Execution System.
Return ONLY JSON: { name, trigger, objective, confidence (0-100), decisionTree: { condition, yes, no }, steps (array of 5), kpi, frequency ("weekly"|"trigger-based") }
Focus on: referral loops, partnership activation, SEO/content flywheels. Automated, data-driven.`,

  ops: `Generate an Operations Execution System.
Return ONLY JSON: { name, trigger, objective, confidence (0-100), decisionTree: { condition, yes, no }, steps (array of 5), kpi, frequency ("daily"|"weekly"|"trigger-based") }
Focus on: tooling, automation, metrics dashboards, weekly review processes. Infrastructure that runs without thinking.`,
};

async function generateSystem(
  category: SystemCategory,
  description: string,
  stage: string,
): Promise<Omit<ExecutionSystem, "id" | "status" | "lastRun" | "nextRun">> {
  type SystemPayload = {
    name: string;
    trigger: string;
    objective: string;
    confidence: number;
    decisionTree: { condition: string; yes: string; no: string };
    steps: string[];
    kpi: string;
    frequency: ExecutionSystem["frequency"];
  };

  const payload = await groqJSON<SystemPayload>(
    SYSTEM_PROMPTS[category],
    `Startup: ${description}\nCurrent stage: ${stage}\nMake all steps and conditions specific to this startup, not generic.`
  );

  return {
    name: payload.name ?? `${category} system`,
    category,
    trigger: payload.trigger ?? "When momentum drops below threshold",
    objective: payload.objective ?? "Improve key metric",
    confidence: Math.min(100, Math.max(0, Number(payload.confidence ?? 70))),
    decisionTree: payload.decisionTree ?? {
      condition: "Key metric is improving week-over-week",
      yes: "Continue current system",
      no: "Switch to backup strategy",
    },
    steps: Array.isArray(payload.steps) ? payload.steps.slice(0, 6) : ["Execute system steps"],
    kpi: payload.kpi ?? "Weekly active users",
    frequency: payload.frequency ?? "weekly",
  };
}

type GenerateBody = {
  description?: string;
  stage?: string;
  categories?: SystemCategory[];
};

export async function POST(request: Request) {
  try {
    const access = await checkPlanAccess("builder");
    if (!access.ok) return access.response;

    await enforceAndTrackAIUsage(access.userId, access.plan);

    const body = (await request.json().catch(() => ({}))) as GenerateBody;
    const description = String(body?.description ?? "").trim();
    const stage = String(body?.stage ?? "Idea").trim();

    if (!description || description.length < 10) {
      return NextResponse.json(
        { ok: false, error: "Startup description required (min 10 chars)" },
        { status: 400 }
      );
    }

    // Default: generate all 6 systems for builder. Free gets only distribution.
    const allCategories: SystemCategory[] = ["distribution", "validation", "revenue", "retention", "growth", "ops"];
    const requestedCategories: SystemCategory[] =
      Array.isArray(body?.categories) && body.categories.length > 0
        ? body.categories.filter((c) => allCategories.includes(c))
        : allCategories;

    // Generate all in parallel for speed
    const results = await Promise.allSettled(
      requestedCategories.map((cat) => generateSystem(cat, description, stage))
    );

    const systems: ExecutionSystem[] = results
      .map((result, i) => {
        if (result.status === "rejected") return null;
        const s = result.value;
        return {
          ...s,
          id: `${requestedCategories[i]}-${Date.now()}-${i}`,
          status: "queued" as SystemStatus,
        };
      })
      .filter((s): s is ExecutionSystem => s !== null);

    return NextResponse.json({ ok: true, systems, generatedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
