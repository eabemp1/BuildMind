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
 * ── v2 REDESIGN (June 30 2026) ──────────────────────────────────────────────
 * PROBLEM: the original formula was an uncapped accumulator (+6 to +12 per
 * task, only -1 to -2 per inactive day). Any founder completing 4+ tasks in
 * a short window saturated to 95-100 and STAYED there — momentum stopped
 * being informative the moment a user became genuinely active, which is
 * the opposite of what the metric is supposed to show.
 *
 * FIX: momentum is now a bounded exponential moving average (EMA) of a
 * daily "activity signal" (0-100), not a running total. This means:
 *   - An active founder settles into a meaningful 60-85 band, not pegged at 100.
 *   - A single great day doesn't permanently inflate the score.
 *   - A single bad day doesn't crater it either — it's a smoothed trend.
 *   - The score behaves like Duolingo/GitHub contribution graphs: it reflects
 *     RECENT pattern, not lifetime accumulation (that's what XP is for).
 *
 * Design intent (unchanged):
 *   - Floor at 20 ensures founders always have something to build on.
 *   - AI warns before score drops (isMomentumDecaying) so intervention is proactive.
 */

const EMA_ALPHA = 0.25; // weight given to today's signal vs the running average

/** Today's activity signal, 0-100, based on what happened. */
function dailyActivitySignal(input: {
  tasksCompletedToday: number;
  isHardTask: boolean;
  reflectionFiled: boolean;
  wasOverridden: boolean;
}): number {
  if (input.wasOverridden && input.tasksCompletedToday === 0) return 40; // soft signal, not punitive
  if (input.tasksCompletedToday === 0) return 0; // no activity today
  let signal = input.isHardTask ? 85 : 70;
  if (input.tasksCompletedToday > 1) signal = Math.min(100, signal + 10);
  if (input.reflectionFiled) signal = Math.min(100, signal + 5);
  return signal;
}

/**
 * applyMomentumEMA — the single function that should be called any time
 * momentum needs to move. Replaces momentumOnTaskComplete/momentumOnReflect/
 * momentumOnOverride/momentumDecay as four separate uncapped mutators.
 *
 * @param current        current momentum_score (0-100)
 * @param signal         today's dailyActivitySignal() output, OR a raw decay
 *                       signal for inactive days (pass 0 with daysInactive>0)
 * @param daysSinceLastUpdate  how many days since momentum was last touched —
 *                       used to apply EMA across gaps, not just consecutive days
 */
export function applyMomentumEMA(
  current: number,
  signal: number,
  daysSinceLastUpdate = 1,
): number {
  // Compound the EMA across any gap days using signal=0 (no activity) for each,
  // then apply today's real signal as the final step. This means a 5-day gap
  // followed by one task doesn't look identical to a 1-day gap + one task.
  let value = current;
  const gapDays = Math.max(0, Math.min(daysSinceLastUpdate - 1, 14)); // cap compounding at 14 days
  for (let i = 0; i < gapDays; i++) {
    value = value + EMA_ALPHA * (0 - value);
  }
  value = value + EMA_ALPHA * (signal - value);
  return Math.round(Math.min(100, Math.max(20, value)));
}

/** Task completed → activity signal computed from task difficulty + same-day count */
export function momentumOnTaskComplete(
  current: number,
  isHardTask = false,
  opts: { tasksCompletedToday?: number; reflectionFiled?: boolean; daysSinceLastUpdate?: number } = {},
): number {
  const signal = dailyActivitySignal({
    tasksCompletedToday: (opts.tasksCompletedToday ?? 0) + 1,
    isHardTask,
    reflectionFiled: opts.reflectionFiled ?? false,
    wasOverridden: false,
  });
  return applyMomentumEMA(current, signal, opts.daysSinceLastUpdate ?? 1);
}

/** Reflection filed on a day with no task → small positive signal, not a big task-equivalent jump */
export function momentumOnReflect(current: number, daysSinceLastUpdate = 1): number {
  return applyMomentumEMA(current, 35, daysSinceLastUpdate);
}

/**
 * Daily decay — called by the evening check cron when no task was completed.
 * Each inactive day pulls momentum toward 0 via the same EMA, naturally
 * decelerating (a founder at 80 drops faster initially than one at 40,
 * matching how "losing a streak" actually feels).
 */
export function momentumDecay(current: number, daysInactive: number): number {
  return applyMomentumEMA(current, 0, Math.max(1, daysInactive));
}

/** Override ("not today") → soft signal, not punitive, same EMA mechanism */
export function momentumOnOverride(current: number, daysSinceLastUpdate = 1): number {
  const signal = dailyActivitySignal({
    tasksCompletedToday: 0, isHardTask: false, reflectionFiled: false, wasOverridden: true,
  });
  return applyMomentumEMA(current, signal, daysSinceLastUpdate);
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
