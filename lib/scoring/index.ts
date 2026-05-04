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
 */

// ─── Score computation ────────────────────────────────────────────────────────

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
 *   execution_score  (0–100) → primary AI-assessed quality signal,  weight 0.40
 *   momentum_score   (0–100) → server-persisted daily activity,      weight 0.25
 *   consistency_score(0–100) → NEW: streak consistency curve,        weight 0.10
 *   xp boost         (0–20)  → achievement XP via stepped thresholds
 *   streak boost     (0–10)  → raw streak days, capped at 30
 *   validation boost (0–20)  → validation_strengths × 4, capped at 20
 *
 * The consistency_score differs from the streak boost:
 *   streak_boost    = linear ramp up to 30 days (rewards length)
 *   consistency     = measures *regularity* — did you show up at least 5 of the
 *                     last 7 days? This rewards cadence over raw day count.
 *
 * Total is clamped to [0, 100]. All inputs are optional — missing ones score 0.
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
    execution  * 0.40 +
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

// ─── Score history persistence ────────────────────────────────────────────────

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

  // 1. Update localStorage cache immediately (for instant UI reads)
  try {
    const raw = localStorage.getItem(SCORE_HIST_KEY);
    const history: ScoreHistoryEntry[] = raw ? JSON.parse(raw) : [];
    const idx = history.findIndex(h => h.date === today);
    if (idx >= 0) { history[idx].score = score; }
    else { history.push({ date: today, score }); }
    localStorage.setItem(SCORE_HIST_KEY, JSON.stringify(history.slice(-30)));
  } catch { /* localStorage unavailable (SSR guard above should prevent this) */ }

  // 2. Persist to server (fire-and-forget — never blocks UI)
  fetch("/api/user/score-history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: today, score }),
  }).catch(() => { /* server unavailable — localStorage copy is the fallback */ });
}

/**
 * getScoreHistory — returns the last 30 days of score history.
 *
 * Reads from localStorage cache. Call syncScoreHistory() on page load to
 * ensure the cache is seeded from the server.
 */
export function getScoreHistory(): ScoreHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SCORE_HIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * syncScoreHistory — fetches server-side score history and merges into localStorage.
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

    // Merge: server records override local for same dates
    const local = getScoreHistory();
    const merged = new Map<string, number>();
    local.forEach(h => merged.set(h.date, h.score));
    history.forEach(h => merged.set(h.date, h.score)); // server wins
    const sorted = Array.from(merged.entries())
      .map(([date, score]) => ({ date, score }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-30);

    localStorage.setItem(SCORE_HIST_KEY, JSON.stringify(sorted));
    return sorted;
  } catch {
    return getScoreHistory();
  }
}

/**
 * getXP — returns the XP value, preferring server-synced value stored in
 * localStorage under a key that is written by syncXP().
 */
export function getXP(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(localStorage.getItem(XP_KEY) ?? "0");
  } catch {
    return 0;
  }
}

/**
 * syncXP — fetches XP from the server and writes it to localStorage.
 * The server reads XP from founder_context.xp (added in migration).
 */
export async function syncXP(): Promise<number> {
  if (typeof window === "undefined") return 0;
  try {
    const res = await fetch("/api/user/xp");
    if (!res.ok) return getXP();
    const { xp } = (await res.json()) as { xp: number };
    if (typeof xp === "number") localStorage.setItem(XP_KEY, String(xp));
    return xp;
  } catch {
    return getXP();
  }
}

// ─── Score deltas ─────────────────────────────────────────────────────────────

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
