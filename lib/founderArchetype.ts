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
    const result: ArchetypeResult = {
      archetype,
      confidence: Math.min(1, Math.max(0, Number(raw.confidence ?? 0.5))),
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
    ...(context.avoidance_signals ?? []),
    ...(context.override_reasons ?? []),
    ...(context.topics_mentioned_repeatedly ?? []),
  ].join("; ");

  if (behaviour.length < 20) return null;
  return classifyFounderArchetype(behaviour, "Behaviour", "reclassification", userId);
}
