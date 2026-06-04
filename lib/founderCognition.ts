import { callModelJSON, hasAIProvider } from "@/lib/ai-providers";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/server/logger";
import type { FounderMemory } from "@/lib/founderMemory";
import type { FounderContext } from "@/lib/founderContext";
import type { FounderArchetype } from "@/lib/founderArchetype";

export interface FounderCognitionState {
  founderIdentity: string;
  behavioralNarrative: string;
  strategicTension: string;
  executionPattern: string;
  emotionalState: string;
  growthEdge: string;
  blindspotRisk: string;
  momentumTrajectory: string;
  confidenceTrajectory: string;
  recommendedOperatingMode: string;
  founderEvolutionSummary: string;
  synthesized_at: string;
  signal_confidence: number;
}

export interface CognitionSynthesisInput {
  memory: FounderMemory | null;
  context: FounderContext | null;
  archetype: FounderArchetype | null;
  recentReflections: Array<{
    outcome: string | null;
    confidence: number | null;
    note: string | null;
    created_at: string;
  }>;
  recentActivity: Array<{
    event_type: string;
    occurred_at: string;
  }>;
  projectStage: string;
  projectTitle: string;
}

const cache = new Map<string, { state: FounderCognitionState; at: number }>();
const CACHE_TTL_MS = 45 * 60 * 1000; // 45 min — avoids cross-session stale synthesis

function aggregateSignals(input: CognitionSynthesisInput): { text: string; confidence: number } {
  const signals: string[] = [];
  let dataPoints = 0;

  if (input.memory) {
    dataPoints++;
    if (input.memory.personality_tags?.length) signals.push(`Behavioral tags: ${input.memory.personality_tags.join(", ")}`);
    if (input.memory.avoidance_zones?.length) signals.push(`Avoids: ${input.memory.avoidance_zones.join(", ")}`);
    if (input.memory.strengths?.length) signals.push(`Strengths: ${input.memory.strengths.join(", ")}`);
    if (input.memory.last_insight) signals.push(`Last insight: ${input.memory.last_insight}`);
    if (input.memory.cofounder_style) signals.push(`Preferred coaching style: ${input.memory.cofounder_style}`);
  }
  if (input.context) {
    dataPoints++;
    signals.push(`Momentum score: ${input.context.momentum_score}/100`);
    signals.push(`Days inactive: ${input.context.days_inactive}`);
    signals.push(`Tasks accepted this week: ${input.context.tasks_accepted_this_week}`);
    signals.push(`Tasks overridden this week: ${input.context.tasks_overridden_this_week}`);
    signals.push(`Cognitive load: ${input.context.cognitive_load}`);
    if (input.context.avoidance_zones?.length) signals.push(`Avoidance zones: ${input.context.avoidance_zones.join(", ")}`);
    if (input.context.topics_mentioned_repeatedly?.length) signals.push(`Repeated topics: ${input.context.topics_mentioned_repeatedly.join(", ")}`);
  }
  if (input.archetype) {
    dataPoints++;
    signals.push(`Founder archetype: ${input.archetype}`);
  }
  if (input.recentReflections.length) {
    dataPoints++;
    const recent = input.recentReflections.slice(0, 5);
    const avgConfidence = recent.reduce((sum, item) => sum + (item.confidence ?? 3), 0) / recent.length;
    signals.push(`Recent reflection outcomes: ${recent.map((item) => item.outcome).filter(Boolean).join(", ")}`);
    signals.push(`Average reflection confidence: ${avgConfidence.toFixed(1)}/5`);
    if (recent[0]?.note) signals.push(`Latest note: ${recent[0].note}`);
  }
  if (input.recentActivity.length) {
    dataPoints++;
    const counts: Record<string, number> = {};
    for (const item of input.recentActivity) counts[item.event_type] = (counts[item.event_type] ?? 0) + 1;
    signals.push(`Recent activity: ${Object.entries(counts).map(([key, count]) => `${key}: ${count}x`).join(", ")}`);
  }

  signals.push(`Current stage: ${input.projectStage}`);
  signals.push(`Product: ${input.projectTitle}`);
  return { text: signals.join("\n"), confidence: Math.min(dataPoints / 5, 1) };
}

function fallbackState(input: CognitionSynthesisInput, confidence = 0.2): FounderCognitionState {
  const momentum = input.context?.momentum_score ?? 50;
  return {
    founderIdentity: `An early-stage founder building ${input.projectTitle || "their product"} at ${input.projectStage} stage.`,
    behavioralNarrative: "Behavioral patterns are still forming, so the system should prioritize concrete execution over deep diagnosis.",
    strategicTension: `The current tension is turning ${input.projectStage} uncertainty into visible proof through small actions.`,
    executionPattern: "Execution history is still accumulating.",
    emotionalState: "No dominant emotional pattern is reliable yet.",
    growthEdge: "The growth edge is closing the gap between stated intention and completed action.",
    blindspotRisk: "The biggest risk is over-reading weak signals before enough behavior has accumulated.",
    momentumTrajectory: `Momentum is ${momentum > 60 ? "building" : momentum > 40 ? "stable" : "at risk"} at ${momentum}/100.`,
    confidenceTrajectory: "Confidence trajectory is still establishing.",
    recommendedOperatingMode: "Foundation mode: create one specific proof-generating action today.",
    founderEvolutionSummary: "A founder in the early stages of building a consistent execution identity.",
    synthesized_at: new Date().toISOString(),
    signal_confidence: confidence,
  };
}

const INTERPRETER_PROMPT = `You are a behavioral psychologist and startup strategist. Interpret the founder signals below into a concise founder cognition state.
Write each field as one sentence. Return only JSON matching the requested keys.

Signals:
{signals}`;

export async function synthesizeFounderCognition(userId: string, input: CognitionSynthesisInput): Promise<FounderCognitionState> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.state;

  const { text, confidence } = aggregateSignals(input);
  if (confidence < 0.2 || !hasAIProvider()) {
    const state = fallbackState(input, confidence);
    cache.set(userId, { state, at: Date.now() });
    return state;
  }

  try {
    const parsed = await callModelJSON<Omit<FounderCognitionState, "synthesized_at">>(
      [
        { role: "system", content: INTERPRETER_PROMPT.replace("{signals}", text) },
        { role: "user", content: "Generate the founder cognition state as JSON." },
      ],
      { role: "reasoning", temperature: 0.4, maxTokens: 600 },
    );
    const state: FounderCognitionState = {
      ...parsed,
      synthesized_at: new Date().toISOString(),
      signal_confidence: Math.min(parsed.signal_confidence ?? confidence, confidence + 0.2),
    };
    cache.set(userId, { state, at: Date.now() });
    return state;
  } catch (err) {
    logError("founderCognition/synthesizeFounderCognition", err);
    const state = fallbackState(input, confidence);
    cache.set(userId, { state, at: Date.now() });
    return state;
  }
}

export function invalidateCognitionCache(userId: string): void {
  cache.delete(userId);
}

export async function loadCognitionInput(userId: string, projectStage: string, projectTitle: string): Promise<CognitionSynthesisInput> {
  const empty: CognitionSynthesisInput = {
    memory: null,
    context: null,
    archetype: null,
    recentReflections: [],
    recentActivity: [],
    projectStage,
    projectTitle,
  };

  try {
    const supabase = createAdminClient();
    const [memoryResult, contextResult, reflectionsResult, activityResult] = await Promise.allSettled([
      supabase.from("founder_memory").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("founder_context").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("reflections").select("outcome, confidence, note, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
      supabase
        .from("activity_log")
        .select("event_type, occurred_at")
        .eq("user_id", userId)
        .gte("occurred_at", new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .order("occurred_at", { ascending: false })
        .limit(50),
    ]);

    const memory = memoryResult.status === "fulfilled" ? (memoryResult.value.data as FounderMemory | null) : null;
    const context = contextResult.status === "fulfilled" ? (contextResult.value.data as FounderContext | null) : null;
    const reflections = reflectionsResult.status === "fulfilled" ? reflectionsResult.value.data ?? [] : [];
    const activity = activityResult.status === "fulfilled" ? activityResult.value.data ?? [] : [];
    const archetypeTag = memory?.personality_tags?.find((tag) => tag.startsWith("archetype:"));

    return {
      memory,
      context,
      archetype: archetypeTag ? (archetypeTag.replace("archetype:", "") as FounderArchetype) : null,
      recentReflections: reflections.map((item) => ({
        outcome: item.outcome,
        confidence: item.confidence,
        note: item.note,
        created_at: item.created_at,
      })),
      recentActivity: activity.map((item) => ({
        event_type: item.event_type,
        occurred_at: item.occurred_at,
      })),
      projectStage,
      projectTitle,
    };
  } catch (err) {
    logError("founderCognition/loadCognitionInput", err);
    return empty;
  }
}

export function buildCognitionPromptBlock(state: FounderCognitionState): string {
  if (state.signal_confidence < 0.2) {
    return "FOUNDER STATE: Behavioral profile is early-stage. Focus on execution habits and specific next actions.";
  }

  return `FOUNDER COGNITION (synthesized behavioral model, confidence ${Math.round(state.signal_confidence * 100)}%):

Identity: ${state.founderIdentity}
Behavioral narrative: ${state.behavioralNarrative}
Strategic tension: ${state.strategicTension}
Execution pattern: ${state.executionPattern}
Emotional state: ${state.emotionalState}
Growth edge: ${state.growthEdge}
Blind spot risk: ${state.blindspotRisk}
Momentum: ${state.momentumTrajectory}
Confidence: ${state.confidenceTrajectory}
Recommended mode: ${state.recommendedOperatingMode}
Evolution: ${state.founderEvolutionSummary}

INSTRUCTION: Respond to the whole pattern above, not only the current task. Do not mention the cognition system.`;
}
