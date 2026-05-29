import { callModelJSON, hasAIProvider } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import type { PromptId } from "@/lib/promptRegistry";
import { updatePromptMetrics } from "@/lib/promptRegistry";

export type EvalContext =
  | "today_action"
  | "today_action_stream"
  | "coach"
  | "morning_briefing"
  | "evening_check"
  | "founder_insight"
  | "break_startup"
  | "onboarding_insight";

export type EvalVerdict = "pass" | "warn" | "fail";

export interface EvalDimension {
  score: number;
  reason: string;
}

export interface EvalRubric {
  helpfulness: EvalDimension;
  specificity: EvalDimension;
  actionability: EvalDimension;
  hallucination_risk: EvalDimension;
  archetype_alignment: EvalDimension;
}

export interface EvalResult {
  verdict: EvalVerdict;
  overall_score: number;
  rubric: EvalRubric;
  pre_screen: { passed: boolean; failed_checks: string[] };
  reject_reason?: string;
  prompt_id?: PromptId;
  prompt_version?: string;
  variant?: "active" | "challenger";
}

export interface EvaluateParams {
  userId: string;
  projectId?: string;
  context: EvalContext;
  promptId?: PromptId;
  promptVersion?: string;
  variant?: "active" | "challenger";
  output: string;
  founderContext: {
    stage?: string;
    targetUsers?: string;
    archetype?: string;
    lastReflection?: string;
    avoidanceZones?: string[];
    momentumScore?: number;
  };
  originalOutput?: string;
}

const CHECKS: Array<{ name: string; test: (output: string, ctx: EvaluateParams["founderContext"]) => boolean }> = [
  { name: "has_number", test: (output) => /\b\d+\b/.test(output) },
  { name: "has_platform", test: (output) => /(linkedin|whatsapp|email|twitter|phone|in person|slack|telegram|instagram|reddit|product hunt|indie hackers)/i.test(output) },
  {
    name: "has_user_type",
    test: (output, ctx) => {
      if (!ctx.targetUsers?.trim()) return true;
      const firstWord = ctx.targetUsers.trim().split(/\s+/)[0]?.toLowerCase();
      return !firstWord || output.toLowerCase().includes(firstWord);
    },
  },
  { name: "not_too_generic", test: (output) => !/\b(some people|potential users|your audience|people who might|early adopters in general)\b/i.test(output) },
  { name: "has_concrete_verb", test: (output) => /(message|call|send|post|dm|email|reach out|interview|show|share|pitch|schedule|record|publish|launch|ask)\b/i.test(output) },
  { name: "no_hallucinated_stats", test: (output) => !/\b\d{1,3}%\s+of\s+(founders|startups|businesses|companies|users)/i.test(output) },
];

function runPreScreen(output: string, ctx: EvaluateParams["founderContext"]) {
  const failed_checks = CHECKS.filter(({ test }) => !test(output, ctx)).map(({ name }) => name);
  return { passed: failed_checks.length === 0, failed_checks };
}

const EVALUATOR_PROMPT = `Evaluate AI-generated startup coaching advice with a strict 1-5 rubric.
Return only JSON with helpfulness, specificity, actionability, hallucination_risk, and archetype_alignment.
Each dimension must have { "score": number, "reason": string }.`;

async function runModelEval(params: EvaluateParams): Promise<EvalRubric | null> {
  if (!hasAIProvider()) return null;
  try {
    return await callModelJSON<EvalRubric>(
      [
        { role: "system", content: EVALUATOR_PROMPT },
        {
          role: "user",
          content: `Founder context:
Stage: ${params.founderContext.stage ?? "Unknown"}
Target users: ${params.founderContext.targetUsers ?? "Unknown"}
Archetype: ${params.founderContext.archetype ?? "Unknown"}
Avoidance zones: ${(params.founderContext.avoidanceZones ?? []).join(", ") || "None"}
Momentum: ${params.founderContext.momentumScore ?? "Unknown"}

Advice:
${params.output}`,
        },
      ],
      { role: "fast", temperature: 0.1, maxTokens: 300 },
    );
  } catch {
    return null;
  }
}

function fallbackRubric(reason: string): EvalRubric {
  return {
    helpfulness: { score: 0, reason },
    specificity: { score: 0, reason: "" },
    actionability: { score: 0, reason: "" },
    hallucination_risk: { score: 0, reason: "" },
    archetype_alignment: { score: 0, reason: "" },
  };
}

function aggregateVerdict(preScreen: { passed: boolean; failed_checks: string[] }, rubric: EvalRubric | null) {
  const hardFails = preScreen.failed_checks.filter((check) => ["has_number", "has_platform", "has_user_type"].includes(check));
  if (hardFails.length) {
    return { verdict: "fail" as const, overall_score: 1, reject_reason: `Pre-screen failed: ${hardFails.join(", ")}` };
  }
  if (!rubric) {
    return {
      verdict: preScreen.failed_checks.length > 1 ? "warn" as const : "pass" as const,
      overall_score: 3,
      reject_reason: preScreen.failed_checks.length ? `Soft checks failed: ${preScreen.failed_checks.join(", ")}` : undefined,
    };
  }

  const weighted = (
    rubric.helpfulness.score +
    rubric.specificity.score +
    rubric.actionability.score +
    rubric.hallucination_risk.score * 2 +
    rubric.archetype_alignment.score * 0.5
  ) / 5.5;
  const overall_score = Math.round(weighted * 10) / 10;
  if (rubric.hallucination_risk.score <= 2) {
    return { verdict: "fail" as const, overall_score, reject_reason: `Hallucination risk: ${rubric.hallucination_risk.reason}` };
  }
  if (overall_score >= 3.5 && preScreen.passed) return { verdict: "pass" as const, overall_score };
  if (overall_score >= 2.5) return { verdict: "warn" as const, overall_score };
  return { verdict: "fail" as const, overall_score, reject_reason: `Low overall quality: ${overall_score}/5` };
}

async function logEvalResult(params: EvaluateParams, result: EvalResult): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("reflexion_quality_log").insert({
      user_id: params.userId,
      project_id: params.projectId ?? null,
      context: params.context,
      verdict: result.verdict,
      reject_reason: result.reject_reason ?? null,
      original_output: params.originalOutput ?? null,
      final_output: params.output,
      stage: params.founderContext.stage ?? null,
      momentum_score: params.founderContext.momentumScore ?? null,
      eval_rubric: result.rubric,
      overall_score: result.overall_score,
      pre_screen_failed: result.pre_screen.failed_checks,
      prompt_id: params.promptId ?? null,
      prompt_version: params.promptVersion ?? null,
      prompt_variant: params.variant ?? "active",
    });
  } catch (err) {
    logError("aiEvaluator/logEvalResult", err);
  }
}

async function maybeRollupMetrics(promptId: PromptId, promptVersion: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("reflexion_quality_log")
      .select("verdict, overall_score, eval_rubric")
      .eq("prompt_id", promptId)
      .eq("prompt_version", promptVersion)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!data?.length || data.length % 20 !== 0) return;
    const passCount = data.filter((row) => row.verdict === "pass").length;
    const avgScore = data.reduce((sum, row) => sum + (row.overall_score ?? 3), 0) / data.length;
    const hallucinationScores = data
      .map((row) => (row.eval_rubric as EvalRubric | null)?.hallucination_risk?.score)
      .filter((score): score is number => typeof score === "number");
    const hallucination_flag_rate = hallucinationScores.length
      ? hallucinationScores.filter((score) => score <= 2).length / hallucinationScores.length
      : 0;
    await updatePromptMetrics(promptId, promptVersion, {
      quality_pass_rate: Math.round((passCount / data.length) * 100) / 100,
      helpfulness_score: Math.round(avgScore * 10) / 10,
      hallucination_flag_rate: Math.round(hallucination_flag_rate * 100) / 100,
      sample_count: data.length,
    });
  } catch (err) {
    logError("aiEvaluator/maybeRollupMetrics", err);
  }
}

export async function evaluateAIOutput(params: EvaluateParams): Promise<EvalResult | null> {
  try {
    const preScreen = runPreScreen(params.output, params.founderContext);
    const hardFails = preScreen.failed_checks.filter((check) => ["has_number", "has_platform"].includes(check));
    const rubric = hardFails.length ? null : await runModelEval(params);
    const verdict = aggregateVerdict(preScreen, rubric);
    const result: EvalResult = {
      ...verdict,
      rubric: rubric ?? fallbackRubric("Model eval skipped or unavailable"),
      pre_screen: preScreen,
      prompt_id: params.promptId,
      prompt_version: params.promptVersion,
      variant: params.variant,
    };
    logEvalResult(params, result).catch(() => {});
    if (params.promptId && params.promptVersion) {
      maybeRollupMetrics(params.promptId, params.promptVersion).catch(() => {});
    }
    return result;
  } catch (err) {
    logError("aiEvaluator/evaluateAIOutput", err);
    return null;
  }
}

export async function getPromptQualitySummary(): Promise<Array<{
  promptId: PromptId;
  version: string;
  pass_rate: number;
  avg_score: number;
  sample_count: number;
}>> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("reflexion_quality_log")
      .select("prompt_id, prompt_version, verdict, overall_score")
      .not("prompt_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(500);
    const grouped = new Map<string, { pass: number; total: number; scoreSum: number }>();
    for (const row of data ?? []) {
      const key = `${row.prompt_id}::${row.prompt_version}`;
      const existing = grouped.get(key) ?? { pass: 0, total: 0, scoreSum: 0 };
      existing.total++;
      if (row.verdict === "pass") existing.pass++;
      existing.scoreSum += row.overall_score ?? 3;
      grouped.set(key, existing);
    }
    return Array.from(grouped.entries()).map(([key, stats]) => {
      const [promptId, version] = key.split("::");
      return {
        promptId: promptId as PromptId,
        version,
        pass_rate: Math.round((stats.pass / stats.total) * 100) / 100,
        avg_score: Math.round((stats.scoreSum / stats.total) * 10) / 10,
        sample_count: stats.total,
      };
    });
  } catch (err) {
    logError("aiEvaluator/getPromptQualitySummary", err);
    return [];
  }
}
