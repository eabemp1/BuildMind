/**
 * lib/conversationContinuity.ts — AI Improvement #2
 *
 * Cross-feature conversation continuity.
 *
 * The problem: AI Coach, Break My Startup, Ventures, and Morning Briefing all
 * pull from the Founder Context Object independently. But there's no continuity
 * of conversation. A founder who just ran a brutal Break My Startup analysis
 * gets no acknowledgement of it when they open AI Coach 2 minutes later.
 *
 * The fix: store the last 3 AI interactions (feature + summary + timestamp)
 * in localStorage + Supabase founder_context, then inject them into every
 * Reflexion pipeline as a continuity prefix.
 *
 * Result: "You just got a difficult competitor analysis. What's your reaction
 * to it?" instead of starting cold.
 *
 * Architecture:
 *   recordInteraction()   — call from every AI route after generating response
 *   getRecentInteractions() — call from reflexion.ts to inject into pipeline
 *   buildContinuityPrompt() — formats last 3 into a natural language prefix
 */

import { storage } from "@/lib/storage";

export type AIFeature =
  | "ai_coach"
  | "break_my_startup"
  | "morning_briefing"
  | "recovery_mode"
  | "ventures"
  | "founder_insight"
  | "action_engine";

export interface RecentInteraction {
  feature: AIFeature;
  /** 1-sentence AI-generated summary of what happened in this session */
  summary: string;
  /** ISO timestamp */
  timestamp: string;
  /** Optional: emotional signal detected ("frustrated", "excited", "uncertain") */
  emotionalSignal?: string;
}

const STORAGE_KEY = "bm_recent_interactions_v1";
const MAX_STORED    = 10; // keep last 10, inject last 3
const INJECT_COUNT  = 3;
const TTL_HOURS     = 72; // don't inject interactions older than 72h

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * recordInteraction — call from any AI route after generating a response.
 * Prepends to localStorage list and async-writes to Supabase.
 *
 * @param feature   Which AI surface generated this interaction
 * @param summary   1-sentence summary of what the AI did/said (AI-generated)
 * @param emotional Optional emotional signal detected in the founder's message
 */
export function recordInteraction(
  feature: AIFeature,
  summary: string,
  emotional?: string,
): void {
  if (typeof window === "undefined") return;
  try {
    const now: RecentInteraction = {
      feature,
      summary: summary.slice(0, 200), // cap length
      timestamp: new Date().toISOString(),
      ...(emotional ? { emotionalSignal: emotional } : {}),
    };
    const existing = storage.getJSON<RecentInteraction[]>(STORAGE_KEY, []);
    const updated  = [now, ...existing].slice(0, MAX_STORED);
    storage.setJSON(STORAGE_KEY, updated);
  } catch {
    // non-critical
  }
}

/**
 * recordInteractionServer — server-side version that writes to Supabase.
 * Call from API routes (they can't access localStorage).
 * Upserts to founder_context.recent_interactions JSONB column.
 */
export async function recordInteractionServer(
  supabase: { from: (t: string) => { select: (...a: unknown[]) => unknown; upsert: (...a: unknown[]) => unknown } },
  userId: string,
  feature: AIFeature,
  summary: string,
  emotional?: string,
): Promise<void> {
  const now: RecentInteraction = {
    feature,
    summary: summary.slice(0, 200),
    timestamp: new Date().toISOString(),
    ...(emotional ? { emotionalSignal: emotional } : {}),
  };

  // Read existing then prepend — keeps last MAX_STORED
  try {
    const { data } = await (supabase
      .from("founder_context")
      .select("recent_interactions") as unknown as Promise<{ data: { recent_interactions?: RecentInteraction[] } | null }>);

    const existing = (data as { recent_interactions?: RecentInteraction[] } | null)
      ?.recent_interactions ?? [];
    const updated  = [now, ...existing].slice(0, MAX_STORED);

    await (supabase
      .from("founder_context")
      .upsert({ user_id: userId, recent_interactions: updated }) as unknown as Promise<void>);
  } catch {
    // non-critical — don't fail the AI response for a continuity write
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

/**
 * getRecentInteractions — returns the last N interactions younger than TTL.
 * Call this before building the Reflexion pipeline context.
 */
export function getRecentInteractions(
  allInteractions: RecentInteraction[],
  count = INJECT_COUNT,
): RecentInteraction[] {
  const cutoff = Date.now() - TTL_HOURS * 3600 * 1000;
  return allInteractions
    .filter(i => new Date(i.timestamp).getTime() > cutoff)
    .slice(0, count);
}

// ── Format ─────────────────────────────────────────────────────────────────────

const FEATURE_LABELS: Record<AIFeature, string> = {
  ai_coach:          "AI Coach",
  break_my_startup:  "Break My Startup",
  morning_briefing:  "Morning Briefing",
  recovery_mode:     "Recovery Mode",
  ventures:          "Ventures Blueprint",
  founder_insight:   "Founder Insight",
  action_engine:     "Action Engine",
};

function timeSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  if (m < 2)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * buildContinuityPrompt — formats recent interactions into a natural language
 * context prefix that gets injected at the top of the Reflexion system prompt.
 *
 * Output example:
 * "RECENT CONTEXT (last 3 sessions):
 *  - 12m ago via Break My Startup: Received a challenging competitor analysis
 *    showing 3 established players in the space. Emotional signal: uncertain.
 *  - 2h ago via AI Coach: Discussed pricing hesitation and whether to launch
 *    at $29 or $39/month.
 *  - Yesterday via Morning Briefing: Priority was getting first 10 users.
 *
 * If the founder's message connects to any of these, acknowledge it naturally."
 */
export function buildContinuityPrompt(interactions: RecentInteraction[]): string {
  if (interactions.length === 0) return "";

  const lines = interactions.map((i) => {
    const label    = FEATURE_LABELS[i.feature] ?? i.feature;
    const when     = timeSince(i.timestamp);
    const emotional = i.emotionalSignal ? ` Emotional signal: ${i.emotionalSignal}.` : "";
    return `  - ${when} via ${label}: ${i.summary}${emotional}`;
  });

  return [
    "RECENT SESSION CONTEXT (inject naturally — do not recite mechanically):",
    ...lines,
    "",
    "If the founder's message connects to any recent session, acknowledge it with one sentence before responding to the current question. If unrelated, ignore this context entirely.",
  ].join("\n");
}

/**
 * injectContinuityIntoSystemPrompt — convenience function used by Reflexion.
 * Prepends continuity block to an existing system prompt string.
 */
export function injectContinuityIntoSystemPrompt(
  baseSystemPrompt: string,
  interactions: RecentInteraction[],
): string {
  const continuityBlock = buildContinuityPrompt(interactions);
  if (!continuityBlock) return baseSystemPrompt;
  return `${continuityBlock}\n\n---\n\n${baseSystemPrompt}`;
}
