import { createAdminClient } from "@/lib/supabase/admin";

const KNOWLEDGE_BASE_FADE_THRESHOLD = 5;
const MATCH_COUNT = 5;
const MIN_SIMILARITY = 0.62;

export interface FounderKnowledgeMatch {
  id: string;
  stage: string;
  company_type: string;
  founder_archetype: string | null;
  what_stalled_them: string;
  what_broke_the_stall: string;
  first_10_days_advice: string;
  draft_angle?: string | null;
  draft_template?: string | null;
  draft_channel?: string | null;
  draft_goal?: string | null;
  similarity: number;
}

const ARCHETYPE_DRAFT_STYLE: Record<string, string> = {
  "technical-overbuilder": "ask for workflow truth before features; avoid technical language unless the recipient uses it first",
  "vision-heavy-executor": "turn the vision into one narrow ask with a concrete reply path",
  "validation-avoider": "make the ask low-pressure, human, and easy to answer",
  "chaotic-high-energy": "include exactly one ask and no extra side quests",
  "methodical-slow-mover": "remove preparation requirements and make imperfect outreach acceptable today",
};

async function embedQuery(text: string): Promise<number[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("[founderKnowledgeBase] GROQ_API_KEY not set");

  const response = await fetch("https://api.groq.com/openai/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "nomic-embed-text-v1_5",
      input: text.slice(0, 512),
    }),
  });

  if (!response.ok) {
    throw new Error(`[founderKnowledgeBase] embedding failed: ${response.status}`);
  }

  const data = (await response.json()) as { data?: { embedding?: number[] }[] };
  const embedding = data.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length !== 768) {
    throw new Error("[founderKnowledgeBase] unexpected embedding shape");
  }
  return embedding;
}

function buildQueryText(description: string, stage: string): string {
  return `${stage} stage startup. ${description}`.slice(0, 512);
}

export async function searchFounderKnowledgeBase(
  description: string,
  stage: string,
  archetype?: string,
  reflectionCount = 0,
): Promise<FounderKnowledgeMatch[]> {
  if (reflectionCount >= KNOWLEDGE_BASE_FADE_THRESHOLD) return [];
  if (!description || description.trim().length < 10) return [];

  try {
    const embedding = await embedQuery(buildQueryText(description.trim(), stage));
    const supabase = createAdminClient();
    const params = {
      query_embedding: JSON.stringify(embedding),
      match_count: MATCH_COUNT,
      filter_stage: stage || null,
      filter_archetype: archetype || null,
    };
    const { data, error } = await supabase.rpc("match_founder_knowledge_base", params);

    if (error || !Array.isArray(data) || data.length === 0) {
      const { data: broadData, error: broadError } = await supabase.rpc("match_founder_knowledge_base", {
        ...params,
        filter_stage: null,
      });
      if (broadError || !Array.isArray(broadData)) return [];
      return (broadData as FounderKnowledgeMatch[]).filter((match) => match.similarity >= MIN_SIMILARITY);
    }

    return (data as FounderKnowledgeMatch[]).filter((match) => match.similarity >= MIN_SIMILARITY);
  } catch (err) {
    console.error("[founderKnowledgeBase] Search failed (non-fatal):", err);
    return [];
  }
}

export function buildKnowledgeBaseContext(
  matches: FounderKnowledgeMatch[],
  founderArchetype?: string,
): string {
  if (matches.length === 0) return "";

  const style = founderArchetype && ARCHETYPE_DRAFT_STYLE[founderArchetype]
    ? ARCHETYPE_DRAFT_STYLE[founderArchetype]
    : null;

  const matchBlock = matches
    .slice(0, 3)
    .map((match, index) => `Precedent ${index + 1} (${match.company_type}, ${match.stage}, similarity ${(match.similarity * 100).toFixed(0)}%):
- Stalled because: ${match.what_stalled_them}
- Broke the stall by: ${match.what_broke_the_stall}
- First 10 days: ${match.first_10_days_advice}
- Draft angle: ${match.draft_angle ?? "Use a specific founder-to-founder ask."}
- Channel goal: ${match.draft_channel ?? "DM"} / ${match.draft_goal ?? "conversation"}`)
    .join("\n\n");

  return `REAL FOUNDER PRECEDENTS:
${matchBlock}
${style ? `\nARCHETYPE DRAFT STYLE: ${style}` : ""}

Instruction: use these as precedent anchors. Make the task and draft specific to this founder, not a generic productivity suggestion.`;
}

export function buildInsightHistorySeeds(matches: FounderKnowledgeMatch[]): Array<{ text: string; created_at: string }> {
  return matches.map((match) => ({
    text: `[Pattern: ${match.company_type} ${match.stage}] ${match.what_stalled_them} -> ${match.what_broke_the_stall}`,
    created_at: new Date().toISOString(),
  }));
}
