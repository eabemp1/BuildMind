/**
 * lib/todayFlowSessions.ts
 *
 * reflexion_learning_log is a SHARED table. Besides Today's own rows it also
 * receives rows from the AI coach ("ai_coach:"), weekly reports
 * ("weekly_report:"), morning briefings ("morning_briefing:"), recovery mode
 * ("recovery_mode:"), and Break My Startup ("bms_…"). None of those are daily
 * actions a founder executed, so none may count toward "tasks this week" or
 * appear in an execution record.
 *
 * Today's flow writes exactly two session_id shapes:
 *   - "today_action:…"  — the "shown" row recordActionShown() creates when a
 *                         recommendation is generated (app/api/ai/today-action)
 *   - "task_complete:…" — the fallback row task-complete inserts when there was
 *                         no shown row to update in place
 *
 * This is an ALLOWLIST on purpose. The first version of the weekly pulse's
 * filter allowed only "today_action" and silently dropped the task_complete
 * fallback rows; the second swapped to "everything except bms_", which let
 * every other writer above count as a task. Both were the same mistake —
 * deciding by what to exclude/omit instead of naming what is Today's. If a
 * new Today-flow prefix is ever added, add it here and nowhere else.
 */

export const TODAY_FLOW_SESSION_PREFIXES = ["today_action", "task_complete:"] as const;

export function isTodayFlowSession(sessionId: string | null | undefined): boolean {
  const s = sessionId ?? "";
  return TODAY_FLOW_SESSION_PREFIXES.some((p) => s.startsWith(p));
}

/** Whether a Today-flow row is the normal shown row or the completion fallback. */
export function todayFlowSource(sessionId: string | null | undefined): "today" | "fallback" {
  return (sessionId ?? "").startsWith("task_complete:") ? "fallback" : "today";
}
