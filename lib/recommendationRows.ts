/**
 * lib/recommendationRows.ts
 *
 * Pure helpers that keep learning data honest.
 *
 * Found in a real intelligence export: the AI Coach logged every chat reply as
 * a "recommendation shown". Those rows are never acted on, so they flipped to
 * "ignored" and produced "43 rejected recommendations", fake repeated actions
 * ("Type "open execution" in the AI Coach chat...") and fake avoidance
 * ("Avoids pricing / build / other"). Anything that learns from
 * reflexion_learning_log must go through these first.
 */

import { isTodayFlowSession } from "@/lib/todayFlowSessions";

type LogLike = { session_id?: string | null; critic_persona?: string | null; action_shown?: string | null };

/** True for rows that are a task/recommendation the founder was actually asked to do. */
export function isFounderRecommendation(row: LogLike): boolean {
  if (row.critic_persona === "ai_coach") return false;
  if (typeof row.session_id === "string" && row.session_id.startsWith("ai_coach:")) return false;
  // Rows with no text at all are structurally odd but not evidence of chat noise; keep them.
  if (row.action_shown == null) return true;
  return isRealTaskTitle(String(row.action_shown));
}

/**
 * Stricter than isFounderRecommendation: for anything that decides TODAY's task
 * or judges whether the founder is "rejecting" recommendations.
 *
 * reflexion_learning_log is shared with morning briefings, weekly reports,
 * Break My Startup and recovery mode. Those rows are never "shown and then
 * executed" through the Today card, so they sit at "pending", flip to "ignored"
 * after 24h, and then show up as fake rejections and as fake "recent tasks".
 * Real production export (Sept 30 - Oct 10): ~21 of ~78 rows were real Today
 * tasks; the rest were briefings / BMS / weekly reports.
 *
 * Allowlist (see lib/todayFlowSessions.ts). Rows with no session_id at all are
 * legacy rows and are kept.
 */
export function isTodayRecommendation(row: LogLike): boolean {
  if (!isFounderRecommendation(row)) return false;
  if (typeof row.session_id !== "string" || row.session_id === "") return true;
  return isTodayFlowSession(row.session_id);
}

/**
 * The AI-written task the founder actually saw ("today_action:" rows or the
 * "task_complete:" fallback) - NOT the deterministic archetype template row
 * (prediction_source = founder_intelligence), which exists for the learning loop
 * and is almost always unresolved.
 */
export function isShownTaskRow(row: LogLike & { prediction_source?: string | null }): boolean {
  return isTodayRecommendation(row) && row.prediction_source !== "founder_intelligence";
}

const NOT_A_TASK = [
  /^you are (the|a|an) /i,                     // a prompt leaked into a title
  /^type ["'`].+["'`] in the ai coach/i,       // coach UI instruction
  /^(sure|yes|no|okay|ok|great|here'?s|here is|i can|i'll|let me)\b/i, // chat replies
  /^as an ai\b/i,
];

/** Rejects chat text and prompt fragments that are not something a founder can do. */
export function isRealTaskTitle(text: string): boolean {
  const t = text.trim();
  if (t.length < 8) return false;
  return !NOT_A_TASK.some((re) => re.test(t));
}

export function normalizeActionKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
}

/** One row per distinct action, keeping the first. A task shown 10 times and ignored is ONE ignored task. */
export function distinctByAction<T extends { action_shown?: string | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = normalizeActionKey(String(r.action_shown ?? ""));
    if (!key) { out.push(r); continue; }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}
