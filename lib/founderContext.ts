/**
 * lib/founderContext.ts — Founder Context Object helpers
 *
 * The Founder Context Object is the brain behind everything (Playbook §3.1).
 * Every interaction — task accepted, override, check-in answer, reflection — 
 * writes into this structure. The Reflexion loop reads it before generating
 * any response. The difference between generic AI output and something that
 * feels like it actually knows the founder is entirely this object.
 */

export type CognitiveLoad = "fresh" | "drained" | "autopilot";

export interface FounderContext {
  user_id: string;
  startup_summary: string | null;
  current_stage: string;
  momentum_score: number;        // 0-100, never breaks, decays slowly
  momentum_updated_at: string;
  last_active: string;           // ISO date
  days_inactive: number;
  tasks_accepted_this_week: number;
  tasks_overridden_this_week: number;
  override_reasons: string[];
  topics_mentioned_repeatedly: string[];
  cognitive_load: CognitiveLoad;
  cognitive_pattern: string | null;
  avoidance_signals: string[];
  breakthrough_moments: string[];
  competitor_context: Record<string, unknown>;
  pattern_flags: {
    avoidance?: boolean;
    override_clustering?: boolean;
    momentum_decay?: boolean;
    topic_repetition?: boolean;
  };
  timezone_offset: number;
  morning_briefing_hour: number;
  evening_check_hour: number;
  updated_at: string;
}

export interface MorningBriefing {
  id: string;
  win: string;
  risk: string;
  action: string;
  created_at: string;
}

// ── Momentum Score logic ────────────────────────────────────────────────────
// Replaces streaks. Never breaks. Decays slowly. AI warns before it drops.

/** Task completed → +6 to +12 depending on category */
export function momentumOnTaskComplete(current: number, isHardTask = false): number {
  const gain = isHardTask ? 12 : 6;
  return Math.min(100, current + gain);
}

/** Reflection filed → +3 (learning compounds) */
export function momentumOnReflect(current: number): number {
  return Math.min(100, current + 3);
}

/** Daily decay — called by evening check if no task completed */
export function momentumDecay(current: number, daysInactive: number): number {
  // Gentle decay: -2 per day inactive, floor at 20
  // Designed so a 7-day break takes you from 80 → 66, not to 0
  const decay = Math.min(daysInactive * 2, 30);
  return Math.max(20, current - decay);
}

/** Override (not today) → -1 (soft signal, not punitive) */
export function momentumOnOverride(current: number): number {
  return Math.max(20, current - 1);
}

/** Warning threshold — agent surface this to user before they drop further */
export function isMomentumDecaying(current: number, previous: number): boolean {
  return previous - current >= 5;
}

export function momentumLabel(score: number): { label: string; color: string; emoji: string } {
  if (score >= 80) return { label: "Unstoppable", color: "#4ade80", emoji: "🔥" };
  if (score >= 65) return { label: "Building momentum", color: "#86efac", emoji: "⚡" };
  if (score >= 50) return { label: "Steady", color: "#fbbf24", emoji: "⚙️" };
  if (score >= 35) return { label: "Slowing down", color: "#fb923c", emoji: "⚠️" };
  return { label: "Needs a win", color: "#f87171", emoji: "🔴" };
}

// ── Context API helpers ─────────────────────────────────────────────────────

/** Fetch the current user's Founder Context Object from the API */
export async function fetchFounderContext(): Promise<FounderContext | null> {
  try {
    const res = await fetch("/api/founder-context", { cache: "no-store" });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data as FounderContext;
  } catch {
    return null;
  }
}

/** Update specific fields in the Founder Context Object */
export async function updateFounderContext(
  patch: Partial<Omit<FounderContext, "user_id" | "updated_at">>
): Promise<void> {
  try {
    await fetch("/api/founder-context", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  } catch {}
}

/** Record a task override with reason — updates override_reasons and momentum */
export async function recordOverride(reason: string): Promise<void> {
  await updateFounderContext({
    tasks_overridden_this_week: undefined, // incremented server-side
    override_reasons: [reason],            // appended server-side
  });
  await fetch("/api/founder-context/override", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

/** Record cognitive load check-in */
export async function recordCognitiveLoad(load: CognitiveLoad): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.setItem("bm_cognitive_load", load);
  }
  await updateFounderContext({ cognitive_load: load });
}

/** Fetch today's morning briefing */
export async function fetchMorningBriefing(): Promise<MorningBriefing | null> {
  try {
    const res = await fetch("/api/morning-briefing", { cache: "no-store" });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data as MorningBriefing;
  } catch {
    return null;
  }
}
