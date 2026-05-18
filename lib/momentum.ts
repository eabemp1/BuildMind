/**
 * lib/momentum.ts — Pure momentum score math
 *
 * Extracted from lib/founderContext.ts (Engineering Fix #9) so these pure
 * functions can be unit-tested independently from the Supabase fetch helpers.
 *
 * All functions are pure — no side effects, no imports, deterministic.
 * The founderContext.ts barrel re-exports everything from here for backward
 * compatibility — call sites don't need to change.
 *
 * Design intent:
 *   - Momentum replaces streaks. It never breaks, just decays slowly.
 *   - Designed so a 7-day break from 80 → 66, not to 0.
 *   - Floor at 20 ensures founders always have something to build on.
 *   - AI warns before score drops (isMomentumDecaying) so intervention is proactive.
 */

// ── Score deltas ──────────────────────────────────────────────────────────────

/** Task completed → +6 to +12 depending on difficulty */
export function momentumOnTaskComplete(current: number, isHardTask = false): number {
  const gain = isHardTask ? 12 : 6;
  return Math.min(100, current + gain);
}

/** Reflection filed → +3 (learning compounds momentum) */
export function momentumOnReflect(current: number): number {
  return Math.min(100, current + 3);
}

/**
 * Daily decay — called by the evening check cron when no task was completed.
 * -2 per day inactive, capped at -30 total, floored at 20.
 */
export function momentumDecay(current: number, daysInactive: number): number {
  const decay = Math.min(daysInactive * 2, 30);
  return Math.max(20, current - decay);
}

/** Override ("not today") → -1 soft signal, not punitive */
export function momentumOnOverride(current: number): number {
  return Math.max(20, current - 1);
}

/** AI surfaces a warning when score has dropped ≥ 5 points since last check */
export function isMomentumDecaying(current: number, previous: number): boolean {
  return previous - current >= 5;
}

// ── Display helpers ───────────────────────────────────────────────────────────

export interface MomentumLabel {
  label: string;
  color: string;
  emoji: string;
}

export function momentumLabel(score: number): MomentumLabel {
  if (score >= 80) return { label: "Unstoppable",        color: "#4ade80", emoji: "🔥" };
  if (score >= 65) return { label: "Building momentum",  color: "#86efac", emoji: "⚡" };
  if (score >= 50) return { label: "Steady",             color: "#fbbf24", emoji: "⚙️" };
  if (score >= 35) return { label: "Slowing down",       color: "#fb923c", emoji: "⚠️" };
  return               { label: "Needs a win",           color: "#f87171", emoji: "🔴" };
}

/**
 * computeMomentumTrend — given a history of scores (oldest first),
 * returns the 7-day trend direction for display.
 */
export type MomentumTrend = "rising" | "stable" | "falling";
export function computeMomentumTrend(history: number[]): MomentumTrend {
  if (history.length < 2) return "stable";
  const recent = history.slice(-7);
  const first  = recent[0];
  const last   = recent[recent.length - 1];
  const delta  = last - first;
  if (delta >= 5)  return "rising";
  if (delta <= -5) return "falling";
  return "stable";
}

/**
 * projectMomentum — given current score and days inactive,
 * returns what the score will be after N more inactive days.
 * Used by Recovery Mode to frame urgency: "In 3 days you'll hit 35."
 */
export function projectMomentum(current: number, additionalDaysInactive: number): number {
  return momentumDecay(current, additionalDaysInactive);
}
