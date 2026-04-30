/**
 * lib/founderMemory.ts — Persistent Founder Memory System
 *
 * Stores and evolves a rich behavioral profile of the founder across sessions.
 * This gives the AI co-founder "context" about who it's working with —
 * not just their startup, but how they think, what they avoid, what motivates them.
 *
 * Data lives in Supabase table: founder_memory (one row per user)
 * Schema:
 *   id uuid PK
 *   user_id uuid FK → auth.users
 *   personality_tags text[]       — e.g. ["ships fast", "avoids sales", "overthinks design"]
 *   decision_patterns jsonb       — recurring choices and outcomes
 *   emotional_signals jsonb       — what energizes / drains them
 *   avoidance_zones text[]        — tasks they consistently skip
 *   strengths text[]              — tasks they complete rapidly / enthusiastically
 *   cofounder_style text          — how the AI should speak to this person
 *   last_insight text             — most recent generated insight
 *   insight_history jsonb[]       — all past insights with timestamps
 *   updated_at timestamptz
 */

import { createClient } from "@/lib/supabase/client";
import { getCurrentUser } from "@/lib/data/projects";

export type DecisionPattern = {
  pattern: string;          // e.g. "delays pricing decisions"
  count: number;
  lastSeen: string;         // ISO date
  outcome?: "good" | "neutral" | "bad";
};

export type EmotionalSignal = {
  trigger: string;          // e.g. "completing validation milestone"
  type: "energizing" | "draining";
  confidence: number;       // 0-1
};

export type CofounderStyle =
  | "direct-challenger"     // pushes back, asks hard questions
  | "strategic-partner"     // thinks long-term, connects dots
  | "execution-coach"       // keeps them on track, celebrates wins
  | "devil-advocate";       // always plays the skeptic

export type ValidationReceipt = {
  id: string;
  personName: string;
  quote: string;
  channel: string;
  date: string;
  problemConfirmed: boolean;
};

export type CompetitorHistoryEntry = {
  name: string;
  url?: string;
  count: number;
  lastSeen: string;
};

export type FounderMemory = {
  id: string;
  user_id: string;
  personality_tags: string[];
  decision_patterns: DecisionPattern[];
  emotional_signals: EmotionalSignal[];
  avoidance_zones: string[];
  strengths: string[];
  cofounder_style: CofounderStyle;
  last_insight: string | null;
  insight_history: { text: string; created_at: string }[];
  updated_at: string;
  // ── CoFounder Core additions ────────────────────────────────────────────
  // Real human validation receipts — surfaced during competitor spirals
  validationReceipts: ValidationReceipt[];
  // Tracks competitor lookup frequency to detect avoidance patterns
  competitorHistory: CompetitorHistoryEntry[];
};

// ── Read ─────────────────────────────────────────────────────────────────────

export async function getFounderMemory(): Promise<FounderMemory | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("founder_memory")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data as FounderMemory;
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function upsertFounderMemory(
  patch: Partial<Omit<FounderMemory, "id" | "user_id" | "updated_at">>
): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  const supabase = createClient();
  await supabase.from("founder_memory").upsert({
    user_id: user.id,
    ...patch,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

// ── Observe & Evolve ──────────────────────────────────────────────────────────

/**
 * Called every time a task is completed or skipped.
 * Detects avoidance patterns and strengths automatically.
 */
export async function observeTaskEvent(
  taskTitle: string,
  event: "completed" | "skipped" | "overdue",
  category?: string
): Promise<void> {
  const memory = await getFounderMemory();
  if (!memory) return;

  const now = new Date().toISOString();

  // Track avoidance
  if (event === "skipped" || event === "overdue") {
    const zone = category ?? taskTitle.split(" ").slice(0, 3).join(" ");
    const avoidance = Array.from(new Set([...memory.avoidance_zones, zone])).slice(0, 10);
    await upsertFounderMemory({ avoidance_zones: avoidance });
  }

  // Track strengths (fast completions)
  if (event === "completed") {
    const strength = category ?? taskTitle.split(" ").slice(0, 3).join(" ");
    const strengths = Array.from(new Set([...memory.strengths, strength])).slice(0, 10);
    await upsertFounderMemory({ strengths });
  }

  // Update decision patterns
  const patternKey = `${event}_${category ?? "general"}`;
  const patterns = [...memory.decision_patterns];
  const existing = patterns.find((p) => p.pattern === patternKey);
  if (existing) {
    existing.count += 1;
    existing.lastSeen = now;
  } else {
    patterns.push({ pattern: patternKey, count: 1, lastSeen: now });
  }
  await upsertFounderMemory({ decision_patterns: patterns.slice(0, 20) });
}

/**
 * Generates a new insight about the founder based on their memory profile.
 * Called periodically (e.g., weekly, or on AI coach open).
 */
export async function generateFounderInsight(): Promise<string | null> {
  const memory = await getFounderMemory();
  if (!memory) return null;

  const prompt = buildInsightPrompt(memory);

  const res = await fetch("/api/ai/founder-insight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, memory }),
  });

  if (!res.ok) return null;
  const body = await res.json().catch(() => ({}));
  const insight: string = body?.insight ?? "";
  if (!insight) return null;

  const history = [
    { text: insight, created_at: new Date().toISOString() },
    ...memory.insight_history,
  ].slice(0, 10);

  await upsertFounderMemory({ last_insight: insight, insight_history: history });
  return insight;
}

function buildInsightPrompt(memory: FounderMemory): string {
  return `
You are studying the behavioral patterns of a startup founder. Based on these signals, generate ONE sharp, non-obvious insight about how they're building — and one specific thing they should change this week.

Avoidance zones (tasks they consistently skip): ${memory.avoidance_zones.join(", ") || "none yet"}
Strengths (tasks they complete quickly): ${memory.strengths.join(", ") || "none yet"}
Decision patterns: ${memory.decision_patterns.map(p => `${p.pattern} (${p.count}x)`).join(", ") || "none yet"}
Personality tags: ${memory.personality_tags.join(", ") || "none yet"}

Write 2 sentences max. Be direct. Don't hedge. The insight should feel like it came from someone who has been watching them build for months.
  `.trim();
}

// ── Co-founder style evolution ────────────────────────────────────────────────

/**
 * Updates co-founder communication style based on user feedback signals.
 * E.g., if they keep asking for more challenge, switch to devil-advocate.
 */
export async function evolveCofounderStyle(
  feedback: "too-soft" | "too-harsh" | "on-point" | "more-strategic"
): Promise<CofounderStyle> {
  const memory = await getFounderMemory();
  const current = memory?.cofounder_style ?? "execution-coach";

  const transitions: Record<string, Record<string, CofounderStyle>> = {
    "too-soft": {
      "execution-coach": "direct-challenger",
      "strategic-partner": "devil-advocate",
      "direct-challenger": "devil-advocate",
      "devil-advocate": "devil-advocate",
    },
    "too-harsh": {
      "devil-advocate": "direct-challenger",
      "direct-challenger": "execution-coach",
      "execution-coach": "strategic-partner",
      "strategic-partner": "strategic-partner",
    },
    "more-strategic": {
      "execution-coach": "strategic-partner",
      "direct-challenger": "strategic-partner",
      "devil-advocate": "strategic-partner",
      "strategic-partner": "strategic-partner",
    },
    "on-point": { [current]: current },
  };

  const next = transitions[feedback]?.[current] ?? current;
  await upsertFounderMemory({ cofounder_style: next });
  return next;
}

// ── Context builder for AI prompts ───────────────────────────────────────────

/**
 * Returns a compact founder context string to prepend to any AI prompt.
 * Use this in every API call to give the AI real memory of the founder.
 */
export function buildFounderContext(memory: FounderMemory): string {
  const lines: string[] = [
    `FOUNDER PROFILE (persistent memory — do not repeat back to user):`,
    memory.personality_tags.length
      ? `Personality: ${memory.personality_tags.join(", ")}`
      : "",
    memory.avoidance_zones.length
      ? `Avoids: ${memory.avoidance_zones.join(", ")}`
      : "",
    memory.strengths.length
      ? `Strong at: ${memory.strengths.join(", ")}`
      : "",
    memory.cofounder_style
      ? `Respond as: ${memory.cofounder_style}`
      : "",
    memory.last_insight
      ? `Last insight about them: "${memory.last_insight}"`
      : "",
  ];
  return lines.filter(Boolean).join("\n");
}
