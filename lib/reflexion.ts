/**
 * lib/reflexion.ts — The Reflexion Loop (Playbook §3.2 + §4.2)
 *
 * Three chained Groq calls: Generator → Critic → Refiner
 * Total latency on Groq: under 2 seconds.
 * The founder sees one response that feels like it came from someone
 * very smart who actually knows them.
 *
 * This is SERVER-SIDE only. Import only from API routes.
 *
 * ── v5 additions ─────────────────────────────────────────────────────────────
 * runFullReflexionPipeline() — Stages 0–7 from the system spec:
 *   Stage 0: Context Ingestion
 *   Stage 1: Data Retrieval (from agent pipeline)
 *   Stage 2: Signal Structuring
 *   Stage 3: Generator (Agent A)
 *   Stage 4: Critic (Agent B — rotating persona)
 *   Stage 5: Verifier (Agent D — new) — validates claims, flags weak reasoning
 *   Stage 6: Scoring Engine
 *   Stage 7: Refiner (Agent C)
 *
 * All existing exports are preserved and unchanged.
 */

import type { AgentPipelineResult, SignalSummary, StartupContext } from "@/lib/agents";
import { callModel, callModelJSON } from "@/lib/ai-providers";
import type { ViabilityScoreResult } from "@/lib/scoring";
import { logError } from "@/lib/server/logger";
import { getBenchmarkInsights, buildBenchmarkPrompt } from "@/lib/benchmarks";

interface GroqMessage { role: "system" | "user" | "assistant"; content: string; }

// groqCall routes ALL reflexion text calls through the reasoning chain.
// gpt-oss-120b (primary) handles both text and JSON on Groq; Cerebras fallback is
// equally fast. Using "reasoning" here means every Reflexion stage (Generator,
// Refiner, Rationale) gets reasoning_effort=high by default — the same model,
// no extra cost, measurably better specificity on task generation.
export async function groqCall(messages: GroqMessage[], temperature = 0.5, maxTokens = 600): Promise<string> {
  return callModel(messages, { role: "reasoning", temperature, maxTokens });
}

/**
 * groqJSONCall — same as groqCall but forces response_format: json_object.
 * Use for Agent B (Critic) and Agent D (Verifier) to guarantee parseable JSON output.
 * Both use the reasoning chain — gpt-oss-120b with reasoning_effort=high + json_object mode.
 */
async function groqJSONCall<T>(messages: GroqMessage[], temperature = 0.3, maxTokens = 400): Promise<T> {
  return callModelJSON<T>(messages, { role: "reasoning", temperature, maxTokens });
}

export interface ReflexionContext {
  startupSummary: string;
  stage: string;
  problem?: string;
  targetUsers?: string;
  momentumScore: number;
  avoidanceSignals?: string[];
  overrideReasons?: string[];
  topicsRepeated?: string[];
  lastReflection?: { outcome: string; note: string; confidence: number };
  cognitiveLoad?: "fresh" | "drained" | "autopilot";
  // v4 additions
  consecutiveTasksCompleted?: number;  // for Emotional Language Layer
  daysInactive?: number;               // for Recovery Mode detection
  weekNumber?: number;                 // for Agent Persona Rotation
  domainDataPoints?: number;           // for Confidence Gate
  // v8 additions
  cofounderStyle?: "direct-challenger" | "strategic-partner" | "execution-coach" | "devil-advocate";
  sessionCount?: number;               // for new-user context injection
}

// ── NEW IN V4: Agent Persona Rotation (Playbook §4.4) ─────────────────────
// Agent B rotates weekly to prevent Llama drift / same-flavour advice.
const CRITIC_PERSONAS: Record<number, { name: string; prompt: string }> = {
  0: {
    name: "Skeptical YC Partner",
    prompt: "You are a skeptical YC partner reviewing startup advice. Find logical flaws, challenge assumptions, demand evidence.",
  },
  1: {
    name: "Aggressive Growth Hacker",
    prompt: "You are an aggressive growth hacker. Find the 10x lever. Cut everything slow. Where's the compounding loop? Be ruthless about speed.",
  },
  2: {
    name: "Frugal Accountant",
    prompt: "You are a frugal accountant reviewing startup advice. What is this actually costing? Where's the ROI? Is there a cheaper way? Demand numbers.",
  },
  3: {
    name: "Customer Empathy Advocate",
    prompt: "You are a customer empathy advocate. Would a real user actually care? Is this solving their problem or the founder's problem? Challenge assumptions about demand.",
  },
};

/**
 * getWeeklyCriticPersona — returns the rotating Agent B persona for this week.
 * Week derived from weekNumber (0-indexed ISO week mod 4) or current date if not provided.
 */
export function getWeeklyCriticPersona(weekNumber?: number): { name: string; prompt: string } {
  const week = weekNumber ?? getISOWeekNumber(new Date());
  return CRITIC_PERSONAS[week % 4];
}

export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// ── NEW IN V4: Emotional Language Layer (Playbook §4.1) ───────────────────
// Warmth injected at specific trigger moments via Agent C's prompt.
export type EmotionalTrigger =
  | "inactive_3plus_days"
  | "two_tasks_in_row"
  | "override_submitted"
  | "first_week_completed"
  | "momentum_low_stable";

export function getEmotionalLanguageInstruction(trigger?: EmotionalTrigger): string {
  if (!trigger) return "";
  const messages: Record<EmotionalTrigger, string> = {
    inactive_3plus_days:
      "EMOTIONAL TONE: This founder has been inactive 3+ days. Open with: \"I know last week was rough. Let's restart clean today — one small thing.\" Then give the task.",
    two_tasks_in_row:
      "EMOTIONAL TONE: This founder just completed two tasks in a row. Acknowledge it: \"That's two in a row. You're building momentum that most founders never find.\" Then move forward.",
    override_submitted:
      "EMOTIONAL TONE: This founder just overrode a task. Open with: \"No problem. What's actually in the way? Let's name it.\" Do not judge. Surface the block.",
    first_week_completed:
      "EMOTIONAL TONE: This founder just completed their first full week. Acknowledge it: \"One week of execution. Most founders don't make it here. Keep going.\"",
    momentum_low_stable:
      "EMOTIONAL TONE: Momentum is low but not falling further. Acknowledge it: \"You're not falling — you're holding. That's enough for today.\" Give one micro-win task.",
  };
  return `\n\n${messages[trigger]}`;
}

/**
 * getCofounderStyleInstruction — maps cofounder_style to a Refiner tone directive.
 * Injected into Stage 7 and the 3-agent loop Refiner so the AI's voice adapts
 * to the founder's stated preference, not just the default "decisive operator."
 */
export function getCofounderStyleInstruction(style?: ReflexionContext["cofounderStyle"]): string {
  if (!style) return "";
  const directives: Record<NonNullable<ReflexionContext["cofounderStyle"]>, string> = {
    "direct-challenger":
      "COMMUNICATION STYLE: Direct-challenger. Push back on the founder's assumptions. Ask the hard question they're avoiding. End every response by naming the assumption that could be wrong.",
    "strategic-partner":
      "COMMUNICATION STYLE: Strategic-partner. Think two steps ahead. Connect today's task to the 6-month outcome. Show how this single action fits the larger arc.",
    "execution-coach":
      "COMMUNICATION STYLE: Execution-coach. Keep it concrete and forward-moving. Celebrate small wins. Break the task into the smallest possible first step. No philosophy — just action.",
    "devil-advocate":
      "COMMUNICATION STYLE: Devil's advocate. After giving the recommendation, end by questioning it: name one reason it might be the wrong move. Make the founder think, not just do.",
  };
  return `\n\n${directives[style]}`;
}

/**
 * getNewUserContextInstruction — for founders with < 5 sessions, override
 * the Generator to focus on discovery rather than pattern-driven tasks.
 */
export function getNewUserContextInstruction(sessionCount?: number): string {
  if ((sessionCount ?? 999) >= 5) return "";
  return `\n\nNEW FOUNDER CONTEXT: This founder has fewer than 5 sessions. You do not have reliable behavioral patterns yet. Do NOT reference patterns you haven't observed. Instead, give a task that will reveal the most about them — one that requires a real decision, forces a conversation with a potential user, or surfaces a hidden assumption. The goal of today's task is as much to learn about this founder as it is to move their startup forward.`;
}

/** Infer the correct emotional trigger from context */
export function inferEmotionalTrigger(ctx: ReflexionContext): EmotionalTrigger | undefined {
  if ((ctx.daysInactive ?? 0) >= 3) return "inactive_3plus_days";
  if ((ctx.consecutiveTasksCompleted ?? 0) >= 2) return "two_tasks_in_row";
  if (ctx.momentumScore < 40 && (ctx.daysInactive ?? 0) <= 1) return "momentum_low_stable";
  return undefined;
}

// ── NEW IN V4: Confidence Gate (Playbook §4.5) ────────────────────────────
// When context is thin, the AI surfaces its uncertainty instead of guessing.
// domainDataPoints is now computed from the actual founder profile fields
// that feed into the Reflexion pipeline — not left at the default of 10.

/**
 * computeDomainDataPoints — counts how many meaningful founder signals
 * are present in the context. Used by shouldTriggerConfidenceGate().
 *
 * Each present, non-empty signal counts as 1 point:
 *   startupSummary (non-empty)         → 2 pts (highest signal, primary context)
 *   stage (non-default "Idea")         → 1 pt
 *   avoidanceSignals (any)             → 1 pt
 *   overrideReasons (any)              → 1 pt
 *   topicsRepeated (any)               → 1 pt
 *   lastReflection present             → 1 pt
 *   cognitiveLoad (non-default)        → 1 pt
 *   consecutiveTasksCompleted > 0      → 1 pt
 *
 * Gate fires when total < 5 — means we have fewer than 5 meaningful signals.
 */
export function computeDomainDataPoints(ctx: ReflexionContext): number {
  let pts = 0;
  if (ctx.startupSummary && ctx.startupSummary.trim().length > 20) pts += 2;
  if (ctx.stage && ctx.stage !== "Idea") pts += 1;
  if ((ctx.avoidanceSignals ?? []).length > 0) pts += 1;
  if ((ctx.overrideReasons ?? []).length > 0) pts += 1;
  if ((ctx.topicsRepeated ?? []).length > 0) pts += 1;
  if (ctx.lastReflection) pts += 1;
  if (ctx.cognitiveLoad && ctx.cognitiveLoad !== "fresh") pts += 1;
  if ((ctx.consecutiveTasksCompleted ?? 0) > 0) pts += 1;
  return pts;
}

export function shouldTriggerConfidenceGate(ctx: ReflexionContext): boolean {
  // Use computeDomainDataPoints if domainDataPoints is not explicitly set.
  // This ensures the gate actually fires instead of always reading the default 10.
  const pts = ctx.domainDataPoints !== undefined
    ? ctx.domainDataPoints
    : computeDomainDataPoints(ctx);
  return pts < 5;
}

export function getConfidenceGateResponse(): string {
  return "I don't have enough context on your local market to give a firm answer here. Should we research competitors together, or do you want to talk to a human mentor?";
}

export interface ReflexionResult {
  output: string;          // The final refined response shown to the founder
  critique: string;        // Internal critic output (stored, not shown)
  rationale: string;       // "Why this, why now" tooltip — one sentence
  nextAction?: string;     // Suggested next concrete action
  verdict?: "pass" | "fail";
  reject_reason?: string | null;
}

/**
 * runReflexionLoop — the 3-agent chain
 *
 * Agent A generates. Agent B critiques harshly. Agent C refines.
 * Each call is fast on Groq (~400ms). Total: ~1.2–1.8s.
 */
export async function runReflexionLoop(
  task: string,
  context: ReflexionContext,
  additionalInstruction = ""
): Promise<ReflexionResult> {
  const contextBlock = buildContextBlock(context);

  // ── NEW IN V4: Confidence Gate — thin context check ──────────────────────
  if (shouldTriggerConfidenceGate(context)) {
    const gateMsg = getConfidenceGateResponse();
    return {
      output: gateMsg,
      critique: "Confidence gate triggered — insufficient domain context.",
      rationale: "Because I need more context to give you a firm answer right now.",
      nextAction: "Decide: should we research together, or connect you with a human mentor?",
    };
  }

  // ── NEW IN V4: Emotional Language Layer — infer trigger ──────────────────
  const emotionalTrigger = inferEmotionalTrigger(context);
  const emotionalInstruction = getEmotionalLanguageInstruction(emotionalTrigger);
  const cofounderStyleInstruction = getCofounderStyleInstruction(context.cofounderStyle);
  const newUserInstruction = getNewUserContextInstruction(context.sessionCount);

  // ── Agent A — The Generator ──────────────────────────────────────────────
  // POSITIONING FIX (from transcript): BuildMind is a universal founder tool, not an Africa-first tool.
  // The product's advantage is behavioral intelligence — knowing how THIS specific founder operates,
  // regardless of geography. Geographic intelligence is a maintenance problem; behavioral intelligence
  // is what our founder memory system actually delivers. Validators came from Russia, India, UK — not
  // just Africa. Build for the world, distribute through African networks.
  const generatorPrompt = `You are a world-class startup execution consultant with behavioral intelligence about this specific founder.
You know how they operate, what they avoid, and what their execution patterns look like. Your advice is not generic — it is calibrated to this person's context, stage, and behavioral profile.
${contextBlock}
${additionalInstruction}${newUserInstruction}
TASK: ${task}
Be specific to this founder's situation. Reference their actual stage, avoidance patterns, and behavioral history. No generic startup advice.`;

  const generated = await groqCall([
    { role: "system", content: generatorPrompt },
    { role: "user", content: "Generate your best response to the task." },
  ], 0.6, 500).catch(() => "Unable to generate a response right now — please try again.");

  // ── NEW IN V4: Agent B — The Critic/Gatekeeper (Persona Rotation) ───────────
  const criticPersona = getWeeklyCriticPersona(context.weekNumber);

  const criticPrompt = `${criticPersona.prompt}

You are a GATEKEEPER, not a reviewer. Your job is to REJECT weak advice and force a rebuild.

REJECT this task if ANY of the following are true:
1. The action does not name a specific platform (e.g. "social media" instead of "LinkedIn" or "WhatsApp")
2. The action does not name the specific user type from the founder's context
3. The action has no number (e.g. "message some people" instead of "message 3 people")
4. The action cannot be completed in under 30 minutes
5. The advice could apply to any founder at any stage (generic)
6. The advice does not address the founder's current stage or last reflection outcome

Respond in JSON ONLY:
{
  "verdict": "pass" | "fail",
  "reason": "one sentence explaining the verdict",
  "improved_version": "a better version of the task if verdict is fail (otherwise null)"
}

FOUNDER CONTEXT:
Stage: ${context.stage} | Target users: ${context.targetUsers ?? "not set"} | Momentum: ${context.momentumScore}/100

ADVICE TO EVALUATE:
${generated}`;

  let critiqueData: { verdict: string; reason: string; improved_version?: string | null } = {
    verdict: "pass",
    reason: "Verdict parsing failed — defaulting to pass",
    improved_version: null,
  };
  try {
    critiqueData = await groqJSONCall<typeof critiqueData>([
      { role: "system", content: criticPrompt },
      { role: "user", content: "Evaluate and give your verdict." },
    ], 0.3, 300);
  } catch (err) {
    logError("reflexion/critic", err); // groqJSONCall failed — default to pass, non-fatal
  }

  const critique = `VERDICT: ${critiqueData.verdict.toUpperCase()} — ${critiqueData.reason}`;

  const baseForRefinement = critiqueData.verdict === "fail" && critiqueData.improved_version
    ? critiqueData.improved_version
    : generated;

  // ── Agent C — The Refiner / Rebuilder (with Emotional Language Layer) ──────
  const refinerMode = critiqueData.verdict === "fail"
    ? "REBUILD: The original was rejected. Use the improved version as a starting point and make it sharper."
    : "POLISH: The task passed gating. Tighten wording and clarity only — do not change the substance.";

  const refinerPrompt = `You are BuildMind's execution engine. ${refinerMode}
Rules:
- Every claim must be backed by logic specific to THIS founder
- Must name the exact platform, the exact user type, and include a number
- Must be harder-hitting than the input
- End with a single concrete action they can start in the next 30 minutes
- No preamble, no "here's the refined version"
- 3–5 sentences maximum
${emotionalInstruction}${cofounderStyleInstruction}

INPUT:
${baseForRefinement}

CRITIQUE:
${critique}

FOUNDER CONTEXT:
Stage: ${context.stage} | Momentum: ${context.momentumScore}/100 | Cognitive: ${context.cognitiveLoad ?? "fresh"} | Target users: ${context.targetUsers ?? "not set"}`;

  const refined = await groqCall([
    { role: "system", content: refinerPrompt },
    { role: "user", content: "Write the refined response." },
  ], 0.3, 400).catch(() => generated);

  const rationalePrompt = `Extract a single sentence (max 15 words) explaining WHY this advice is right for this founder RIGHT NOW.
Format: "Because [specific reason tied to their stage/situation]."
Advice: ${refined}`;

  const rationale = await groqCall([
    { role: "system", content: rationalePrompt },
    { role: "user", content: "One sentence rationale only." },
  ], 0.2, 60).catch(() => `Because you're at ${context.stage} stage and this is the highest-leverage move.`);

  return {
    output: refined,
    critique,
    rationale: rationale.trim(),
    nextAction: extractAction(refined),
    verdict: (critiqueData.verdict ?? "pass") as "pass" | "fail",
    reject_reason: critiqueData.verdict === "fail" ? (critiqueData.reason ?? null) : null,
  };
}

// ─── v5: Full 7-Stage Reflexion Pipeline ─────────────────────────────────────

/**
 * VerifierOutput — Stage 5 output from Agent D
 * Validates all claims in the generated action against available signals.
 */
export interface VerifierOutput {
  valid_claims: string[];       // claims supported by real signals
  weak_claims: string[];        // claims that are assumptions, not evidence
  missing_data: string[];       // what's needed to increase confidence
  confidence_score: number;     // 0–1 overall confidence in the output
  verdict: "verified" | "partial" | "rejected";
  rejection_reason?: string;    // only when verdict is "rejected"
}

/**
 * FullReflexionInput — everything needed to run the 7-stage pipeline.
 */
export interface FullReflexionInput {
  // Stage 0: Founder context
  founderContext: ReflexionContext;
  // Stage 1: Agent pipeline results (from runAgentPipeline)
  agentPipeline: AgentPipelineResult;
  // Stage 6: Viability score (from computeViabilityScore)
  viabilityScore: ViabilityScoreResult;
  // The specific task/question to generate an action for
  task: string;
  // Optional: execution mode flag (generates MVP roadmap instead of single action)
  executionMode?: boolean;
  // Optional: injected behavioral patterns from lib/learning.ts
  learnedPatternsPrompt?: string;
}

/**
 * FullReflexionOutput — final output of the 7-stage pipeline.
 */
export interface FullReflexionOutput {
  // Stage 7 final output
  action: string;               // The single highest-leverage next move
  rationale: string;            // "Why this, why now"
  supporting_signals: string[]; // Real signals backing the action
  risks: string[];              // Risks to this specific action
  confidence: number;           // 0–1
  scores: {
    viability: number;
    execution_risk: number;
  };
  // Internal pipeline outputs (stored for quality logging)
  _pipeline: {
    stage2_structured_signals: string[];
    stage3_generated: string;
    stage4_critique: string;
    stage5_verifier: VerifierOutput;
    stage4_persona: string;
  };
}

/**
 * runFullReflexionPipeline — Stages 0–7
 *
 * Stage 0: Context already ingested (passed in as founderContext)
 * Stage 1: Agent signals already retrieved (passed in as agentPipeline)
 * Stage 2: Signal structuring — distil to highest-leverage insights
 * Stage 3: Generator (Agent A) — single highest-leverage action
 * Stage 4: Critic (Agent B) — rotating persona, harsh critique
 * Stage 5: Verifier (Agent D) — validates claims against signals
 * Stage 6: Scoring — already computed (passed in as viabilityScore)
 * Stage 7: Refiner (Agent C) — final output adjusted for cognitive state
 */
export async function runFullReflexionPipeline(
  input: FullReflexionInput,
): Promise<FullReflexionOutput> {
  const { founderContext, agentPipeline, viabilityScore, task, executionMode, learnedPatternsPrompt = '' } = input;
  const signals = agentPipeline.signal_summary;
  const contextBlock = buildContextBlock(founderContext);

  // ── Stage 1: Benchmark context ingestion ──────────────────────────────────
  // Fetch peer cohort insights for this founder's stage.
  // Best-effort: never blocks pipeline on error (empty string = no benchmark block).
  let benchmarkPrompt = "";
  try {
    // getBenchmarkInsights requires a Supabase client — use the server-side admin
    // client if available. We pass a minimal compatible interface.
    const { createClient: createAdminSb } = await import("@supabase/supabase-js");
    const sbAdmin = createAdminSb(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const cohorts = await getBenchmarkInsights(sbAdmin as Parameters<typeof getBenchmarkInsights>[0], {
      stage:             founderContext.currentStage ?? "Idea",
      signalTypes:       ["avoidance", "task_completed", "momentum_recovery"],
      avoidanceCategory: founderContext.avoidanceSignals?.[0],
    });
    benchmarkPrompt = buildBenchmarkPrompt(cohorts);
  } catch {
    // Non-fatal — pipeline continues without benchmark context
  }

  // ── Stage 2: Signal Structuring ───────────────────────────────────────────
  // Distil the 5-agent outputs into the highest-signal insights
  const structuredSignals = structureSignals(signals, agentPipeline);

  // ── Stage 3: Generator (Agent A) ─────────────────────────────────────────
  const emotionalTrigger = inferEmotionalTrigger(founderContext);
  const emotionalInstruction = getEmotionalLanguageInstruction(emotionalTrigger);
  const cofounderStyleInstruction = getCofounderStyleInstruction(founderContext.cofounderStyle);
  const newUserInstruction = getNewUserContextInstruction(founderContext.sessionCount);

  const generatorSystemPrompt = `You are an advanced startup intelligence engine operating as a decisive operator — not a consultant.
${contextBlock}${newUserInstruction}

VERIFIED MARKET SIGNALS:
${structuredSignals.map((s, i) => `${i + 1}. ${s}`).join("\n")}

VIABILITY CONTEXT:
- Overall viability: ${viabilityScore.viability_score}/100 (${viabilityScore.verdict})
- Demand signal: ${signals.demand_score}/100
- Competition pressure: ${signals.competition_score}/100
- Timing: ${signals.timing_score}/100

CRITICAL RULES:
- Generate the SINGLE highest-leverage next move for this founder
- Tie every claim to a specific signal listed above
- Name exact platform, exact user type, exact number
- If uncertain about something, say "I don't know" — never fabricate
- Optimize for ACTION, not analysis
- Adjust difficulty for cognitive state: ${founderContext.cognitiveLoad ?? "fresh"}
${learnedPatternsPrompt ? learnedPatternsPrompt : ""}
${benchmarkPrompt ? `\n${benchmarkPrompt}` : ""}
${executionMode ? "\nEXECUTION MODE: Generate the first concrete step of the MVP roadmap, not a validation task." : ""}`;

  const generated = await groqCall([
    { role: "system", content: generatorSystemPrompt },
    { role: "user", content: `Task: ${task}\n\nGenerate the single highest-leverage action. Direct, intelligent, specific.` },
  ], 0.5, 500).catch(() => "Unable to generate action — please try again.");

  // ── Stage 4: Critic (Agent B — Rotating Persona) ─────────────────────────
  const criticPersona = getWeeklyCriticPersona(founderContext.weekNumber);

  const stage4CriticPrompt = `${criticPersona.prompt}

You are reviewing a recommended action for a startup founder.
Your job: find logical flaws, weak assumptions, and generic thinking.

Be harsh and specific. Reference the actual signals.

SIGNALS AVAILABLE:
${structuredSignals.slice(0, 5).join("\n")}

FOUNDER:
Stage: ${founderContext.stage} | Momentum: ${founderContext.momentumScore}/100
Viability: ${viabilityScore.viability_score}/100

Respond in JSON:
{
  "verdict": "pass" | "fail",
  "primary_flaw": "the single biggest problem with this action",
  "specific_critique": "2-3 sentence specific critique tied to signals",
  "improved_version": "a sharper version if fail, null if pass"
}

ACTION TO CRITIQUE:
${generated}`;

  let stage4Output: {
    verdict: string;
    primary_flaw: string;
    specific_critique: string;
    improved_version?: string | null;
  } = {
    verdict: "pass",
    primary_flaw: "Critique unavailable",
    specific_critique: "Agent B did not respond — defaulting to pass.",
    improved_version: null,
  };

  try {
    stage4Output = await callModelJSON<typeof stage4Output>(
      [
        { role: "system", content: stage4CriticPrompt },
        { role: "user", content: "Evaluate and critique." },
      ],
      { role: "reasoning", temperature: 0.3, maxTokens: 350 },
    );
  } catch (err) { logError("reflexion/stage4-critic", err); /* non-fatal, use default */ }

  const stage4Critique = `[${criticPersona.name}] VERDICT: ${stage4Output.verdict.toUpperCase()} — ${stage4Output.primary_flaw}. ${stage4Output.specific_critique}`;

  // ── Stage 5: Verifier (Agent D) ───────────────────────────────────────────
  const baseForVerification = stage4Output.verdict === "fail" && stage4Output.improved_version
    ? stage4Output.improved_version
    : generated;

  const stage5VerifierPrompt = `You are the Verifier Agent in a startup intelligence pipeline.
Your job: validate every claim in this action against the available signals.
Be honest — weak claims must be flagged, not hidden.

AVAILABLE SIGNALS:
${structuredSignals.join("\n")}

PAIN POINTS CONFIRMED: ${signals.all_pain_points.slice(0, 3).join(", ") || "none confirmed"}
COMPETITOR GAPS: ${signals.competitor_gaps.slice(0, 3).join(", ") || "none identified"}
OVERALL CONFIDENCE: ${signals.overall_confidence}

Respond in JSON:
{
  "valid_claims": ["claim supported by signals 1", "..."],
  "weak_claims": ["assumption not supported by signals 1", "..."],
  "missing_data": ["what would increase confidence 1", "..."],
  "confidence_score": 0.0–1.0,
  "verdict": "verified" | "partial" | "rejected",
  "rejection_reason": "only if rejected"
}

ACTION TO VERIFY:
${baseForVerification}`;

  const verifierFallback: VerifierOutput = {
    valid_claims: ["Action is stage-appropriate"],
    weak_claims: ["Specific demand confirmation not available"],
    missing_data: ["User interview data", "Willingness-to-pay evidence"],
    confidence_score: 0.4,
    verdict: "partial",
  };

  let stage5Output: VerifierOutput = verifierFallback;
  try {
    const raw = await callModelJSON<VerifierOutput>(
      [
        { role: "system", content: stage5VerifierPrompt },
        { role: "user", content: "Verify the claims." },
      ],
      { role: "reasoning", temperature: 0.2, maxTokens: 400 },
    );
    if (raw.verdict && raw.confidence_score !== undefined) {
      stage5Output = {
        ...verifierFallback,
        ...raw,
        confidence_score: Math.min(1, Math.max(0, Number(raw.confidence_score) || 0.4)),
      };
    }
  } catch (err) { logError("reflexion/verifier", err); /* use fallback */ }

  // ── Stage 7: Refiner (Agent C) ────────────────────────────────────────────
  // Adjusts for cognitive load, emotional state, and verifier feedback.
  // If verifier rejected: rebuilds from signals.
  // If partial: adds caveats and surfaces the weak claims.
  // If verified: polishes only.

  const refinerMode =
    stage5Output.verdict === "rejected"
      ? "REBUILD from signals — the action was rejected by the verifier."
      : stage5Output.verdict === "partial"
      ? "POLISH and add appropriate caveats for weak claims."
      : "POLISH — verified. Tighten wording and clarity only.";

  const weakClaimsNote = stage5Output.weak_claims.length > 0
    ? `\nWEAK CLAIMS TO CAVEAT: ${stage5Output.weak_claims.join(", ")}`
    : "";

  const stage7RefinerPrompt = `You are BuildMind's final output engine. ${refinerMode}

RULES:
- Direct, intelligent, slightly warm — decisive operator tone, not consultant
- Tie every recommendation to a specific signal
- Name exact platform, exact user type, exact number or time
- End with one concrete action the founder can start in the next 30 minutes
- Max 4 sentences
- If confidence is low (${stage5Output.confidence_score < 0.5 ? "YES — it is low" : "no, confidence is adequate"}), acknowledge uncertainty directly
- Cognitive state today: ${founderContext.cognitiveLoad ?? "fresh"} — adjust difficulty accordingly
${weakClaimsNote}
${emotionalInstruction}${cofounderStyleInstruction}

INPUT ACTION:
${baseForVerification}

CRITIQUE:
${stage4Critique}

VERIFIER:
Confidence: ${stage5Output.confidence_score} | Verdict: ${stage5Output.verdict}
Valid: ${stage5Output.valid_claims.join(", ")}`;

  const finalAction = await groqCall([
    { role: "system", content: stage7RefinerPrompt },
    { role: "user", content: "Write the final action." },
  ], 0.3, 400).catch(() => baseForVerification);

  // Extract rationale
  const rationalePrompt = `One sentence (max 15 words): why is this action right for this founder right now?
Format: "Because [specific reason]."
Context: Stage=${founderContext.stage}, Viability=${viabilityScore.viability_score}/100, Demand=${signals.demand_score}/100
Action: ${finalAction}`;

  const rationale = await groqCall([
    { role: "system", content: rationalePrompt },
    { role: "user", content: "One sentence rationale." },
  ], 0.2, 60).catch(() => `Because you're at ${founderContext.stage} stage and this is the highest-leverage move right now.`);

  // Execution risk: inverse of viability, adjusted by verifier confidence
  const execution_risk = Math.min(
    97,
    Math.max(3, Math.round(
      (100 - viabilityScore.viability_score) * 0.6 +
      signals.risk_score * 0.3 +
      (1 - stage5Output.confidence_score) * 10,
    )),
  );

  return {
    action: finalAction,
    rationale: rationale.trim(),
    supporting_signals: stage5Output.valid_claims.slice(0, 4),
    risks: agentPipeline.risk?.top_risks?.slice(0, 3).map(r => r.title) ?? [],
    confidence: stage5Output.confidence_score,
    scores: {
      viability: viabilityScore.viability_score,
      execution_risk,
    },
    _pipeline: {
      stage2_structured_signals: structuredSignals,
      stage3_generated: generated,
      stage4_critique: stage4Critique,
      stage5_verifier: stage5Output,
      stage4_persona: criticPersona.name,
    },
  };
}

// ─── Stage 2 helper: Signal Structuring ──────────────────────────────────────

/**
 * structureSignals — converts raw AgentPipelineResult into a prioritised
 * list of high-signal insights for Agent A (Generator) to reason from.
 */
function structureSignals(signals: SignalSummary, pipeline: AgentPipelineResult): string[] {
  const structured: string[] = [];

  // Demand signals
  if (pipeline.market?.demand_signals) {
    pipeline.market.demand_signals.slice(0, 2).forEach(s => {
      structured.push(`[DEMAND] ${s}`);
    });
  }

  // Pain points
  signals.all_pain_points.slice(0, 2).forEach(p => {
    structured.push(`[PAIN] ${p}`);
  });

  // Competitor gaps
  signals.competitor_gaps.slice(0, 2).forEach(g => {
    structured.push(`[GAP] ${g}`);
  });

  // Timing
  if (pipeline.trend?.window_of_opportunity) {
    structured.push(`[TIMING] ${pipeline.trend.window_of_opportunity}`);
  }

  // Top risks
  signals.all_risks.slice(0, 2).forEach(r => {
    structured.push(`[RISK:${r.severity.toUpperCase()}] ${r.title} — ${r.description}`);
  });

  // Opportunities
  signals.all_opportunities.slice(0, 2).forEach(o => {
    structured.push(`[OPPORTUNITY] ${o}`);
  });

  return structured.filter(Boolean);
}

// ─── Existing functions (unchanged) ──────────────────────────────────────────

/**
 * runReflexionStrike — the onboarding Reflexion Strike (Playbook §2.1)
 * One-sentence startup description → market gap + first task in ~15 seconds
 */
export async function runReflexionStrike(
  startupDescription: string,
  stage = "Idea",
  domain = ""
): Promise<{ marketGap: string; firstTask: string; rationale: string }> {
  const prompt = `You are BuildMind, an agentic execution partner for solo founders.
A founder just described their startup in one sentence. Respond with:
1. marketGap: The crowded part of this market + the gap nobody has claimed yet (2 sentences, specific)
2. firstTask: One concrete action they can complete in the next 30 minutes that validates whether this gap is real
3. rationale: Why this task, why now (1 sentence)

Be brutally specific. No generic startup advice.
Stage: ${stage}
Domain: ${domain || "not specified"}`;

  const parsed = await callModelJSON<Record<string, string>>([
    { role: "system", content: prompt },
    { role: "user", content: `Startup: "${startupDescription}"` },
  ], { role: "fast", temperature: 0.5, maxTokens: 400 })
    .catch(() => ({} as Record<string, string>));
  return {
    marketGap: parsed.marketGap ?? "The market has a real gap here — let's validate it.",
    firstTask: parsed.firstTask ?? "Find one person who has this problem and send them a message in the next 30 minutes.",
    rationale: parsed.rationale ?? "Because talking to one real person beats a week of planning.",
  };
}

/**
 * generateMorningBriefing — for the 7am scheduled job (Playbook §3.2 Stage 1)
 * Returns: win (yesterday), risk (today), action (right now)
 */
export async function generateMorningBriefing(
  context: ReflexionContext & { yesterdayTask?: string; completedYesterday?: boolean }
): Promise<{ win: string; risk: string; action: string }> {
  const prompt = `You are BuildMind's morning briefing engine. Generate a 3-line morning briefing for a solo founder.
Rules:
- win: One specific win from their recent work (look at momentum and stage — make it feel real)
- risk: The single biggest risk they face TODAY at their current stage
- action: One concrete action they must do in the next 2 hours
Each line: max 20 words. No emojis. No fluff. Brutally specific to this founder.
${buildContextBlock(context)}
${context.yesterdayTask ? `Yesterday's task: "${context.yesterdayTask}"` : ""}
${context.completedYesterday !== undefined ? `Completed: ${context.completedYesterday}` : ""}`;

  const parsed = await callModelJSON<Record<string, string>>([
    { role: "system", content: prompt },
    { role: "user", content: "Generate the morning briefing." },
  ], { role: "fast", temperature: 0.4, maxTokens: 200 })
    .catch(() => ({} as Record<string, string>));
  return {
    win: parsed.win ?? "You're still here — that already puts you ahead of 90% of founders.",
    risk: parsed.risk ?? "Inertia: every hour without action makes the next action harder.",
    action: parsed.action ?? "Open your task list and do the first thing before checking anything else.",
  };
}

/**
 * generateEveningNudge — context-specific nudge if task not completed (Playbook §3.2 Stage 1)
 * NEVER generic. Always references something specific from their context.
 */
export async function generateEveningNudge(
  context: ReflexionContext & { todayTask?: string }
): Promise<string> {
  const avoidance = context.avoidanceSignals?.length
    ? `This founder avoids: ${context.avoidanceSignals.join(", ")}.`
    : "";
  const topicRepeat = context.topicsRepeated?.length
    ? `They keep mentioning: ${context.topicsRepeated.join(", ")}.`
    : "";

  const prompt = `You are BuildMind's evening check engine.
A founder did NOT complete their task today. Generate ONE specific nudge.
Rules:
- Reference their actual situation (stage, avoidance, repeated topics)
- Never generic ("Don't forget your task!")
- Ask one pointed question OR state one uncomfortable truth
- Max 30 words
- No emojis
${avoidance} ${topicRepeat}
Stage: ${context.stage} | Today's task: "${context.todayTask ?? "not set"}"`;

  return groqCall([
    { role: "system", content: prompt },
    { role: "user", content: "Generate the evening nudge." },
  ], 0.5, 60).catch(() =>
    `You haven't completed today's task yet. What specifically is blocking you?`
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function buildContextBlock(ctx: ReflexionContext): string {
  const lines: string[] = [
    `FOUNDER CONTEXT:`,
    `Startup: ${ctx.startupSummary || "Not yet set"}`,
    `Stage: ${ctx.stage}`,
    `Momentum score: ${ctx.momentumScore}/100`,
  ];
  if (ctx.problem) lines.push(`Problem: ${ctx.problem}`);
  if (ctx.targetUsers) lines.push(`Target users: ${ctx.targetUsers}`);
  if (ctx.cognitiveLoad) lines.push(`Cognitive state today: ${ctx.cognitiveLoad}`);
  if (ctx.avoidanceSignals?.length) lines.push(`Avoidance signals: ${ctx.avoidanceSignals.join(", ")}`);
  if (ctx.overrideReasons?.length) lines.push(`Recent override reasons: ${ctx.overrideReasons.join(", ")}`);
  if (ctx.topicsRepeated?.length) lines.push(`Topics mentioned repeatedly: ${ctx.topicsRepeated.join(", ")}`);
  if (ctx.lastReflection) {
    lines.push(`Last reflection: outcome=${ctx.lastReflection.outcome}, confidence=${ctx.lastReflection.confidence}/5`);
    if (ctx.lastReflection.note) lines.push(`Their note: "${ctx.lastReflection.note}"`);
  }
  return lines.join("\n");
}

function extractAction(text: string): string {
  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
  const actionSentence = sentences.find(s =>
    /\b(do|send|call|write|post|reach out|open|find|talk|test|launch|build|contact)\b/i.test(s)
  );
  return actionSentence ?? sentences[sentences.length - 1] ?? "";
}
