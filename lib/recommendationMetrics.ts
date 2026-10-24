/**
 * lib/recommendationMetrics.ts — measures whether recommendations are repeating and whether recovery helps.
 *
 * Pure. Feed it rows from reflexion_learning_log (or the `reflexion_learning_log` table of a data export).
 * Run scripts/recommendation-metrics.ts on an export to get a baseline, run it again later to compare.
 */

import { isShownTaskRow } from "@/lib/recommendationRows";
import { assessRecovery, shownFromLog, isSilent, type LogRow } from "@/lib/recommendationRecovery";

export interface RecommendationMetrics {
  /** Rows that were real Today tasks. Briefings, coach chat and reports are excluded. */
  shown_rows: number;
  distinct_tasks: number;
  /** Distinct tasks shown on 2+ different days. */
  repeated_tasks: number;
  /** Distinct tasks that hit the stall threshold and are not resolved or progressing. */
  stalled_tasks: number;
  stalled_silent_tasks: number;
  longest_repeat_days: number;
  /** Share of distinct tasks that were completed or learned from. */
  resolved_share: number;
  /** Share of all shown rows that belong to a stalled task. */
  rows_on_stalled_share: number;
  by_mode: Record<string, number>;
  worst: Array<{ action: string; days_shown: number; outcomes: Record<string, number>; mode: string | null }>;
}

export function computeRecommendationMetrics(rows: Array<LogRow & { session_id?: string | null; critic_persona?: string | null; prediction_source?: string | null }>): RecommendationMetrics {
  const shown = rows.filter((r) => isShownTaskRow(r as never));
  const a = assessRecovery(shownFromLog(shown));
  const stalled = a.stalled;
  const byMode: Record<string, number> = {};
  for (const c of a.clusters) if (c.mode) byMode[c.mode] = (byMode[c.mode] ?? 0) + 1;
  const stalledRows = stalled.reduce((n, c) => n + c.timesShown, 0);
  return {
    shown_rows: shown.length,
    distinct_tasks: a.clusters.length,
    repeated_tasks: a.clusters.filter((c) => c.daysShown >= 2).length,
    stalled_tasks: stalled.length,
    stalled_silent_tasks: stalled.filter(isSilent).length,
    longest_repeat_days: a.clusters.reduce((m, c) => Math.max(m, c.daysShown), 0),
    resolved_share: a.clusters.length ? Math.round((a.clusters.filter((c) => c.resolved).length / a.clusters.length) * 100) / 100 : 0,
    rows_on_stalled_share: shown.length ? Math.round((stalledRows / shown.length) * 100) / 100 : 0,
    by_mode: byMode,
    worst: [...a.clusters].sort((x, y) => y.daysShown - x.daysShown).slice(0, 5).map((c) => ({ action: c.action.slice(0, 90), days_shown: c.daysShown, outcomes: c.outcomes, mode: c.mode })),
  };
}
