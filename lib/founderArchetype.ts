import { groqJSON } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildInsightHistorySeeds, searchFounderKnowledgeBase } from "@/lib/founderKnowledgeBase";
import { buildPatternSeeds, findMatchingPatterns } from "@/lib/founderPatternLibrary";
import type { FounderMemory } from "@/lib/founderMemory";
import type { FounderContext } from "@/lib/founderContext";

export type FounderArchetype =
  | "technical-overbuilder"
  | "vision-heavy-executor"
  | "validation-avoider"
  | "chaotic-high-energy"
  | "methodical-slow-mover";

export interface ArchetypeResult {
  archetype: FounderArchetype;
  confidence: number;
  signals: string[];
  toneDirective: string;
  watchFor: string;
}

export const ARCHETYPE_TONE: Record<FounderArchetype, string> = {
  "technical-overbuilder": "Push them toward users constantly. Every feature conversation should end with who asked for this. Celebrate customer interaction more than product polish.",
  "vision-heavy-executor": "Anchor every response to this week's specific deliverable. Name the big vision once, then force the next 48-hour execution step.",
  "validation-avoider": "Make customer conversations low-stakes and inevitable. Challenge build assumptions with whether a real person told them that.",
  "chaotic-high-energy": "Celebrate energy but enforce one focus. End every conversation by confirming exactly one priority and one completion condition.",
  "methodical-slow-mover": "Compress timelines aggressively. Good enough to learn from is the mantra. Praise rough shipping over elegant planning.",
};

export const ARCHETYPE_WATCH: Record<FounderArchetype, string> = {
  "technical-overbuilder": "building features without user validation",
  "vision-heavy-executor": "shifting between ideas instead of executing the current one",
  "validation-avoider": "deferring customer conversations indefinitely",
  "chaotic-high-energy": "starting new workstreams before finishing current ones",
  "methodical-slow-mover": "planning instead of shipping",
};

export const ARCHETYPE_DRAFT_STYLE: Record<FounderArchetype, string[]> = {
  "technical-overbuilder": ["curious", "observation-led"],
  "vision-heavy-executor": ["direct", "peer"],
  "validation-avoider": ["warm", "referral"],
  "chaotic-high-energy": ["direct"],
  "methodical-slow-mover": ["peer", "curious"],
};

const FALLBACK: ArchetypeResult = {
  archetype: "validation-avoider",
  confidence: 0.5,
  signals: ["insufficient signal from available onboarding data"],
  toneDirective: ARCHETYPE_TONE["validation-avoider"],
  watchFor: ARCHETYPE_WATCH["validation-avoider"],
};

function validArchetype(value: unknown): value is FounderArchetype {
  return typeof value === "string" && value in ARCHETYPE_TONE;
}

// ── Empirical Bayes shrinkage for archetype confidence ──────────────────
// Previously archetype_confidence was whatever the LLM self-reported in a
// single onboarding classification call, then frozen forever — no
// mechanism ever revisited it as the founder accumulated real behavioral
// evidence. That's the actual reason "Day 30: confidence >= 0.65" wasn't a
// promise the system could keep: confidence had no relationship to elapsed
// time or evidence volume at all, in either direction.
//
// This blends the raw confidence with a cohort prior (average confidence
// among other founders at the same stage), weighted by how much of this
// founder's OWN resolved evidence exists. At onboarding, individual
// evidence is ~0, so confidence honestly reflects "founders like you"
// rather than one LLM guess from a paragraph of onboarding text. As real
// evidence accumulates (see recomputeArchetypeConfidence below, called
// periodically from the weekly job), the blend shifts toward what's
// actually true of THIS founder.
const SHRINKAGE_K = 5; // "virtual observations" the cohort prior is worth

async function getStageConfidencePrior(supabase: ReturnType<typeof createAdminClient>, stage: string): Promise<number> {
  try {
    const { data: stageUsers } = await supabase.from("founder_context").select("user_id").eq("current_stage", stage).limit(200);
    const ids = (stageUsers ?? []).map((r: { user_id: string }) => r.user_id);
    if (ids.length < 5) return 0.5; // not enough cohort data to trust yet — neutral prior
    const { data: mem } = await supabase.from("founder_memory").select("archetype_confidence").in("user_id", ids).not("archetype_confidence", "is", null);
    const values = (mem ?? []).map((r: { archetype_confidence: number | null }) => r.archetype_confidence).filter((v: unknown): v is number => typeof v === "number");
    if (values.length < 5) return 0.5;
    return values.reduce((a: number, b: number) => a + b, 0) / values.length;
  } catch {
    return 0.5;
  }
}

async function getEvidenceCount(supabase: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  try {
    const { count } = await supabase
      .from("reflexion_learning_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .neq("outcome", "pending");
    return count ?? 0;
  } catch {
    return 0;
  }
}

function shrinkConfidence(individualConfidence: number, individualEvidenceCount: number, cohortPrior: number, k = SHRINKAGE_K): number {
  return (individualEvidenceCount * individualConfidence + k * cohortPrior) / (individualEvidenceCount + k);
}

/**
 * Recomputes archetype_confidence for a founder using their CURRENT amount
 * of resolved evidence, without re-running the LLM classification (the
 * archetype label itself stays sticky — this only updates how much to
 * trust it). Meant to be called periodically (weekly job) so confidence
 * actually moves as evidence accumulates, instead of being set once at
 * onboarding and never touched again.
 */
export async function recomputeArchetypeConfidence(userId: string, stage: string): Promise<number | null> {
  try {
    const supabase = createAdminClient();
    const { data: memory } = await supabase.from("founder_memory").select("archetype_confidence, personality_tags").eq("user_id", userId).maybeSingle();
    const archetypeTag = (memory?.personality_tags as string[] | undefined)?.find((t) => t.startsWith("archetype:"));
    if (!archetypeTag || archetypeTag === "archetype:unclassified") return null; // nothing to recompute confidence for

    const rawConfidence = typeof memory?.archetype_confidence === "number" ? memory.archetype_confidence : 0.5;
    const [prior, evidenceCount] = await Promise.all([
      getStageConfidencePrior(supabase, stage),
      getEvidenceCount(supabase, userId),
    ]);
    const shrunk = shrinkConfidence(rawConfidence, evidenceCount, prior);

    await supabase.from("founder_memory").update({ archetype_confidence: shrunk, updated_at: new Date().toISOString() }).eq("user_id", userId);
    return shrunk;
  } catch (err) {
    console.error("[founderArchetype] recomputeArchetypeConfidence failed:", err);
    return null;
  }
}

async function upsertArchetype(userId: string, result: ArchetypeResult, statusTag: string) {
  const supabase = createAdminClient();
  const { data: existing } = await supabase
    .from("founder_memory")
    .select("personality_tags")
    .eq("user_id", userId)
    .maybeSingle();

  const oldTags = Array.isArray(existing?.personality_tags) ? existing.personality_tags as string[] : [];
  const cleaned = oldTags.filter((tag) => !tag.startsWith("archetype:"));
  const tags = [statusTag, ...cleaned].slice(0, 10);

  await supabase.from("founder_memory").upsert({
    user_id: userId,
    personality_tags: tags,
    archetype_confidence: result.confidence,
    archetype_classified_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

export async function classifyFounderArchetype(
  idea: string,
  stage: string,
  blocker: string,
  userId?: string,
  extractedTags: string[] = [],
): Promise<ArchetypeResult> {
  const matchedPatterns = findMatchingPatterns(idea, stage, blocker, extractedTags);
  const patternContext = matchedPatterns.length
    ? `\nKnown founder patterns:\n${matchedPatterns.map((pattern) => `- ${pattern.pattern}: ${pattern.lesson}`).join("\n")}`
    : "";

  const systemPrompt = `You are a founder behavioural analyst.
Classify the founder into exactly one archetype:
- technical-overbuilder
- vision-heavy-executor
- validation-avoider
- chaotic-high-energy
- methodical-slow-mover

Return only JSON:
{ "archetype": "one key", "confidence": 0.0, "signals": ["signal 1", "signal 2"] }
Use 0.5 when ambiguous. Signals must come from the founder's input.`;

  const userPrompt = `Idea: ${idea.slice(0, 500)}
Stage: ${stage}
Primary blocker: ${blocker}
Extracted tags: ${extractedTags.join(", ") || "none"}${patternContext}`;

  try {
    const raw = await groqJSON<{ archetype?: string; confidence?: number; signals?: string[] }>(systemPrompt, userPrompt);
    const archetype = validArchetype(raw.archetype) ? raw.archetype : FALLBACK.archetype;
    const rawConfidence = Math.min(1, Math.max(0, Number(raw.confidence ?? 0.5)));

    // Shrink toward the stage cohort prior — at onboarding this founder has
    // ~0 resolved evidence of their own, so the raw LLM confidence (a guess
    // from one paragraph of onboarding text) shouldn't be trusted at face
    // value. See recomputeArchetypeConfidence() for how this evolves later
    // as real evidence accumulates.
    const supabaseForPrior = createAdminClient();
    const [prior, evidenceCount] = userId
      ? await Promise.all([getStageConfidencePrior(supabaseForPrior, stage), getEvidenceCount(supabaseForPrior, userId)])
      : [0.5, 0];
    const shrunkConfidence = shrinkConfidence(rawConfidence, evidenceCount, prior);

    const result: ArchetypeResult = {
      archetype,
      confidence: shrunkConfidence,
      signals: Array.isArray(raw.signals) ? raw.signals.slice(0, 3) : FALLBACK.signals,
      toneDirective: ARCHETYPE_TONE[archetype],
      watchFor: ARCHETYPE_WATCH[archetype],
    };

    if (userId) {
      const statusTag = result.confidence >= 0.65 ? `archetype:${result.archetype}` : "archetype:unclassified";
      await upsertArchetype(userId, result, statusTag);

      const seeds = [...buildPatternSeeds(matchedPatterns)];
      const kbMatches = await searchFounderKnowledgeBase(idea, stage, result.confidence >= 0.65 ? result.archetype : undefined, 0);
      seeds.push(...buildInsightHistorySeeds(kbMatches));
      if (seeds.length) {
        const supabase = createAdminClient();
        await supabase.from("founder_memory").upsert({
          user_id: userId,
          insight_history: seeds.slice(0, 10),
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      }
    }

    return result;
  } catch (err) {
    console.error("[founderArchetype] Classification failed:", err);
    if (userId) await upsertArchetype(userId, FALLBACK, "archetype:unclassified").catch(() => {});
    return FALLBACK;
  }
}

export function buildArchetypeSystemContext(personalityTags: string[] = []): string {
  const archetypeTag = personalityTags.find((tag) => tag.startsWith("archetype:"));
  if (!archetypeTag || archetypeTag === "archetype:unclassified") return "";
  const archetype = archetypeTag.replace("archetype:", "") as FounderArchetype;
  if (!ARCHETYPE_TONE[archetype]) return "";
  return [
    `FOUNDER ARCHETYPE: ${archetype}`,
    `Tone directive: ${ARCHETYPE_TONE[archetype]}`,
    `Watch for: ${ARCHETYPE_WATCH[archetype]}`,
    `Preferred draft styles: ${ARCHETYPE_DRAFT_STYLE[archetype].join(", ")}`,
  ].join("\n");
}

export async function reclassifyFounderArchetypeIfEligible(
  userId: string,
  memory: Partial<FounderMemory>,
  context: Partial<FounderContext>,
): Promise<ArchetypeResult | null> {
  const lastClassified = memory.archetype_classified_at ? new Date(memory.archetype_classified_at).getTime() : 0;
  const sevenDays = 7 * 24 * 60 * 60 * 1000;
  if (lastClassified && Date.now() - lastClassified < sevenDays) return null;

  const behaviour = [
    ...(memory.avoidance_zones ?? []),
    ...(memory.strengths ?? []),
    ...(context.avoidance_zones ?? []),
    ...(context.override_reasons ?? []),
    ...(context.topics_mentioned_repeatedly ?? []),
  ].join("; ");

  if (behaviour.length < 20) return null;
  return classifyFounderArchetype(behaviour, "Behaviour", "reclassification", userId);
}
