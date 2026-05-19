/**
 * lib/scoring/index.ts
 *
 * Startup score computation — extracted from lib/buildmind.ts.
 * Single responsibility: given project snapshot data, return a 0–100 score.
 *
 * Imported by:
 *   lib/buildmind.ts   (re-exported for backwards compatibility)
 *   app/today/page.tsx
 *   app/(dashboard)/dashboard/page.tsx
 *
 * ── Score persistence (Fix 2) ────────────────────────────────────────────────
 * Score history and XP are now persisted server-side in founder_context so they
 * survive device switches, browser clears, and incognito sessions.
 *
 * Strategy:
 *   - recordScoreServerSide() / getScoreHistoryServerSide() — server (API routes)
 *   - recordScore() / getScoreHistory() — client shim: writes to Supabase via
 *     the /api/user/score-history endpoint, falls back to localStorage when
 *     offline or unauthenticated (dev mode).
 *
 * The localStorage copy remains as a fast-read cache and offline fallback, but
 * it is always seeded from the server on first load (see syncScoreHistory()).
 *
 * ── v3 additions ─────────────────────────────────────────────────────────────
 * computeViabilityScore()   — 5-dimension AI viability scoring from agent signals
 * computeViabilityBreakdown() — returns labelled breakdown for UI rendering
 * computeIterationDelta()   — tracks score change across analysis runs
 */

import type { SignalSummary } from "@/lib/agents";
import { storage } from "@/lib/storage";

// ─── Score computation (existing — unchanged) ─────────────────────────────────

export interface ScoringInput {
  // Milestone-task progress is intentionally excluded — AI-generated milestones
  // are not standardised, so completion rate is a noisy signal. A founder with
  // 10 trivial auto-generated milestones all ticked off would look better than
  // one with 3 hard real ones. We use behaviour-based signals instead.
  validation_strengths?: string[] | null;
  execution_score?: number | null;   // AI-assessed execution quality (0-100)
  momentum_score?: number | null;    // Supabase-persisted activity momentum (0-100)
  xp?: number | null;               // Cumulative achievement XP (server-synced)
  streak?: number | null;           // Authoritative streak (Supabase-synced)
}

/**
 * computeStartupScore — enhanced 5-signal model (v2)
 *
 * Signal weights:
 *   execution_score  (0–100) → primary AI-assessed quality signal,  weight 0.45
 *   momentum_score   (0–100) → server-persisted daily activity,      weight 0.25
 *   xp boost         (0–20)  → absolute achievement XP bonus
 *   streak boost     (0–10)  → absolute raw streak bonus, capped at 30 days
 *   validation boost (0–20)  → absolute validation_strengths bonus
 *
 * The consistency_score differs from the streak boost:
 *   streak_boost    = linear ramp up to 30 days (rewards length)
 *   consistency     = measures *regularity* — did you show up at least 5 of the
 *                     last 7 days? This rewards cadence over raw day count.
 *
 * The raw ceiling can exceed 100, intentionally allowing exceptional behaviour
 * to offset weak signals. The final result is clamped to [0, 100]. All inputs
 * are optional — missing ones score 0.
 * Returns an integer 0–100.
 */
export function computeStartupScore(summary: ScoringInput): number {
  const execution = summary.execution_score ?? 0;
  const momentum  = summary.momentum_score  ?? 0;

  // XP → 0–20 boost via stepped thresholds
  const xp = summary.xp ?? 0;
  const xpBoost =
    xp >= 3500 ? 20 :
    xp >= 2000 ? 16 :
    xp >= 1000 ? 12 :
    xp >= 500  ?  8 :
    xp >= 200  ?  4 : 0;

  // Streak → 0–10 boost, capped at 30-day streak = 10 pts
  const streak = Math.min(summary.streak ?? 0, 30);
  const streakBoost = Math.round((streak / 30) * 10);

  // Validation strengths → 0–20 boost
  const strengthBoost = Math.min(20, (summary.validation_strengths ?? []).length * 4);

  const raw =
    execution  * 0.45 +
    momentum   * 0.25 +
    xpBoost         +   // absolute pts (0–20)
    streakBoost     +   // absolute pts (0–10)
    strengthBoost;      // absolute pts (0–20)

  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * computeScoreFromHistory — derives a consistency bonus (0-10) from the last
 * 7 days of score records. Used by the enhanced score model.
 *
 * Rule: ≥5 active days in last 7 → full 10 pts. Scales linearly below.
 */
export function computeConsistencyBonus(
  scoreHistory: { date: string; score: number }[],
): number {
  const today = new Date();
  let activeDays = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (scoreHistory.some(h => h.date === ds && h.score > 0)) activeDays++;
  }
  return Math.round((Math.min(activeDays, 5) / 5) * 10);
}

/**
 * computeStartupScoreV2 — extended version that includes consistency bonus.
 * Used when score history is available (server-side or synced client).
 */
export function computeStartupScoreV2(
  summary: ScoringInput,
  scoreHistory: { date: string; score: number }[] = [],
): number {
  const base = computeStartupScore(summary);
  const consistencyBonus = computeConsistencyBonus(scoreHistory);
  // Consistency replaces 5pts of the raw score space, doesn't add on top
  // (keeps max at 100). Weight: consistency contributes up to 10 pts from
  // a 0.10 slice of the total budget already included in the base calc.
  return Math.min(100, Math.max(0, Math.round(base * 0.90 + consistencyBonus)));
}

// ─── v3: Viability scoring from agent signals ─────────────────────────────────

/**
 * ViabilityBreakdown — the 5-dimension breakdown shown in the UI.
 * Each dimension is 0–100. The overall viability_score is the weighted sum.
 */
export interface ViabilityBreakdown {
  demand: number;         // How real and strong is the market demand?
  competition: number;    // How navigable is the competitive landscape? (inverse of saturation)
  timing: number;         // Is this the right moment?
  uniqueness: number;     // How differentiated is the solution?
  monetization: number;   // How clear and viable is the path to revenue?
}

export interface ViabilityScoreResult {
  viability_score: number;          // 0–100 overall
  confidence: number;               // 0–1 from agent pipeline
  breakdown: ViabilityBreakdown;
  verdict: "strong" | "viable" | "risky" | "critical";
  verdict_reason: string;           // one sentence explanation
}

/**
 * computeViabilityScore — 5-dimension scoring engine powered by agent signals.
 *
 * Dimension weights:
 *   demand        → 0.30  (core question: do people urgently want this?)
 *   competition   → 0.20  (can you actually win in this space?)
 *   timing        → 0.15  (is the window open right now?)
 *   uniqueness    → 0.20  (is there a defensible angle?)
 *   monetization  → 0.15  (is there a clear path to revenue?)
 *
 * competition dimension inverts the competition_score (high competition = lower score).
 *
 * Accepts an optional monetizationClarity override (0–100) from the input parser.
 * When not provided, estimates from demand and uniqueness signals.
 */
export function computeViabilityScore(
  signals: SignalSummary,
  monetizationClarity = -1,
): ViabilityScoreResult {
  const demand = signals.demand_score;

  // Competition dimension: invert saturation (high competition = bad for founder)
  // competition_score in signals = how competitive the space is (0=empty, 100=saturated)
  // We want uniqueness/navigability, so we invert and blend with uniqueness
  const competition = Math.round(
    (100 - signals.competition_score) * 0.6 + signals.uniqueness_score * 0.4
  );

  const timing = signals.timing_score;
  const uniqueness = signals.uniqueness_score;

  // Monetization: use override if provided, else estimate from demand + uniqueness
  const monetization = monetizationClarity >= 0
    ? monetizationClarity
    : Math.round(demand * 0.5 + uniqueness * 0.3 + timing * 0.2);

  // Weighted sum
  const raw =
    demand       * 0.30 +
    competition  * 0.20 +
    timing       * 0.15 +
    uniqueness   * 0.20 +
    monetization * 0.15;

  // Confidence penalty: low confidence agents drag the score toward the middle
  const confidencePenalty = (1 - signals.overall_confidence) * 15;
  const viability_score = Math.min(97, Math.max(3, Math.round(raw - confidencePenalty)));

  // Verdict thresholds
  const verdict: ViabilityScoreResult["verdict"] =
    viability_score >= 72 ? "strong" :
    viability_score >= 52 ? "viable" :
    viability_score >= 35 ? "risky" : "critical";

  const verdict_reason =
    verdict === "strong"   ? "Strong demand, clear differentiation, and good timing align." :
    verdict === "viable"   ? "Viable but key risks need addressing before scaling." :
    verdict === "risky"    ? "Significant gaps in demand or differentiation — pivot or validate urgently." :
                             "Critical issues across multiple dimensions — major rethink needed.";

  return {
    viability_score,
    confidence: signals.overall_confidence,
    breakdown: { demand, competition, timing, uniqueness, monetization },
    verdict,
    verdict_reason,
  };
}

/**
 * computeViabilityBreakdown — returns a labelled array for UI rendering.
 * Each entry has a label, score, weight, and interpretation.
 */
export interface BreakdownEntry {
  key: keyof ViabilityBreakdown;
  label: string;
  score: number;
  weight: string;
  interpretation: "strong" | "moderate" | "weak";
  tip: string;
}

export function computeViabilityBreakdown(breakdown: ViabilityBreakdown): BreakdownEntry[] {
  const entries: Array<{
    key: keyof ViabilityBreakdown;
    label: string;
    weight: string;
    tips: { strong: string; moderate: string; weak: string };
  }> = [
    {
      key: "demand",
      label: "Market Demand",
      weight: "30%",
      tips: {
        strong:   "Real, confirmed demand with strong pain signals.",
        moderate: "Demand exists but pain intensity needs confirmation via user interviews.",
        weak:     "Demand is unconfirmed — talk to 5 target users before building anything.",
      },
    },
    {
      key: "competition",
      label: "Competitive Position",
      weight: "20%",
      tips: {
        strong:   "Clear differentiation with an exploitable gap in the market.",
        moderate: "Competitive landscape is navigable but differentiation needs sharpening.",
        weak:     "Crowded space with no clear wedge — you need a specific niche to own.",
      },
    },
    {
      key: "timing",
      label: "Market Timing",
      weight: "15%",
      tips: {
        strong:   "Macro forces are working in your favour — the window is open.",
        moderate: "Timing is acceptable but no strong tailwind to accelerate growth.",
        weak:     "Timing signals are unfavourable — either too early or too late.",
      },
    },
    {
      key: "uniqueness",
      label: "Differentiation",
      weight: "20%",
      tips: {
        strong:   "Strong moat potential with defensible positioning.",
        moderate: "Some differentiation but competitors could copy quickly.",
        weak:     "No clear moat — needs a unique angle competitors cannot easily replicate.",
      },
    },
    {
      key: "monetization",
      label: "Monetization Clarity",
      weight: "15%",
      tips: {
        strong:   "Clear path to revenue with evidence of willingness to pay.",
        moderate: "Monetization model is plausible but needs validation.",
        weak:     "No clear path to revenue — define your pricing before building.",
      },
    },
  ];

  return entries.map(e => {
    const score = breakdown[e.key];
    const interpretation: BreakdownEntry["interpretation"] =
      score >= 65 ? "strong" : score >= 40 ? "moderate" : "weak";
    return {
      key: e.key,
      label: e.label,
      score,
      weight: e.weight,
      interpretation,
      tip: e.tips[interpretation],
    };
  });
}

// ─── Iteration delta tracking ─────────────────────────────────────────────────

export interface IterationRecord {
  run_id: string;
  timestamp: string;
  viability_score: number;
  breakdown: ViabilityBreakdown;
  idea_snapshot: string;
}

/**
 * computeIterationDelta — given two consecutive analysis runs, returns
 * what changed and by how much. Used in the continuous iteration loop.
 */
export interface IterationDelta {
  score_delta: number;                  // overall score change
  dimension_deltas: Partial<ViabilityBreakdown>;  // per-dimension changes
  improved_dimensions: string[];
  regressed_dimensions: string[];
  net_direction: "improving" | "declining" | "stable";
}

export function computeIterationDelta(
  previous: IterationRecord,
  current: IterationRecord,
): IterationDelta {
  const score_delta = current.viability_score - previous.viability_score;

  const dimension_deltas: Partial<ViabilityBreakdown> = {};
  const improved_dimensions: string[] = [];
  const regressed_dimensions: string[] = [];

  const dimensions: Array<keyof ViabilityBreakdown> = [
    "demand", "competition", "timing", "uniqueness", "monetization"
  ];

  for (const dim of dimensions) {
    const delta = current.breakdown[dim] - previous.breakdown[dim];
    dimension_deltas[dim] = delta;
    if (delta >= 5) improved_dimensions.push(dim);
    else if (delta <= -5) regressed_dimensions.push(dim);
  }

  const net_direction: IterationDelta["net_direction"] =
    score_delta >= 3 ? "improving" :
    score_delta <= -3 ? "declining" : "stable";

  return {
    score_delta,
    dimension_deltas,
    improved_dimensions,
    regressed_dimensions,
    net_direction,
  };
}

// ─── Score history persistence (existing — unchanged) ─────────────────────────

export type ScoreHistoryEntry = { date: string; score: number };

const SCORE_HIST_KEY = "bm_score_history";   // localStorage cache key
const XP_KEY         = "bm_xp";             // localStorage XP cache key

/**
 * recordScore — persists today's score.
 *
 * Primary: writes to the server via /api/user/score-history (non-blocking).
 * Fallback: localStorage cache, used immediately for UI and when offline.
 */
export function recordScore(score: number): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().slice(0, 10);

  // 1. Update storage cache immediately (for instant UI reads)
  try {
    const history = storage.getJSON<ScoreHistoryEntry[]>(SCORE_HIST_KEY, []);
    const idx = history.findIndex(h => h.date === today);
    if (idx >= 0) { history[idx].score = score; }
    else { history.push({ date: today, score }); }
    storage.setJSON(SCORE_HIST_KEY, history.slice(-30));
  } catch { /* storage unavailable */ }

  // 2. Persist to server (fire-and-forget — never blocks UI)
  fetch("/api/user/score-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: today, score }),
  }).catch(() => { /* server unavailable — storage copy is the fallback */ });
}

export function getScoreHistory(): ScoreHistoryEntry[] {
  if (typeof window === "undefined") return [];
  return storage.getJSON<ScoreHistoryEntry[]>(SCORE_HIST_KEY, []);
}

/**
 * syncScoreHistory — fetches server-side score history and merges into storage.
 *
 * Call once on page load (Today page, Overview page). The merge strategy is
 * "server wins for dates where the server has a record".
 */
export async function syncScoreHistory(): Promise<ScoreHistoryEntry[]> {
  if (typeof window === "undefined") return [];
  try {
    const res = await fetch("/api/user/score-history");
    if (!res.ok) return getScoreHistory();
    const { history } = (await res.json()) as { history: ScoreHistoryEntry[] };
    if (!Array.isArray(history)) return getScoreHistory();

    const local = getScoreHistory();
    const merged = new Map<string, number>();
    local.forEach(h => merged.set(h.date, h.score));
    history.forEach(h => merged.set(h.date, h.score)); // server wins
    const sorted = Array.from(merged.entries())
      .map(([date, score]) => ({ date, score }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    storage.setJSON(SCORE_HIST_KEY, sorted);
    return sorted;
  } catch {
    return getScoreHistory();
  }
}

/**
 * getXP — returns the XP value from the user-scoped storage cache.
 */
export function getXP(): number {
  if (typeof window === "undefined") return 0;
  return Number(storage.get(XP_KEY) ?? "0");
}

/**
 * syncXP — fetches XP from the server and writes it to storage.
 */
export async function syncXP(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const res = await fetch("/api/user/xp");
    if (!res.ok) return getXP();
    const { xp } = (await res.json()) as { xp: number };
    if (typeof xp === "number") storage.set(XP_KEY, String(xp));
    return xp;
  } catch {
    return getXP();
  }
}

// ─── Score deltas (existing — unchanged) ─────────────────────────────────────

/**
 * computeScoreDelta
 *
 * Given an outcome and confidence level (1–5), returns how many points
 * should be added to or subtracted from the current score.
 *
 * v2 changes: granular partial outcomes, steeper blocked penalty at low confidence.
 */
export type Outcome = "completed" | "blocked" | "partial" | "learned";

export function computeScoreDelta(outcome: Outcome, confidence: number): number {
  if (outcome === "completed" && confidence >= 4) return 6;
  if (outcome === "completed") return 3;
  if (outcome === "partial" && confidence >= 3) return 1;
  if (outcome === "partial") return -2;
  if (outcome === "blocked") return -5;
  if (outcome === "learned") return 2;
  return 0;
}

/**
 * applyScoreDelta — clamps to [0, 100]
 */
export function applyScoreDelta(current: number, delta: number): number {
  return Math.min(100, Math.max(0, current + delta));
}
