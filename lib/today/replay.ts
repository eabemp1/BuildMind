/**
 * lib/today/replay.ts — time-travel replay of the guards over real history.
 *
 * "If these rules had existed, how many of the tasks we actually showed would
 * have been rejected?" For each shown task we rebuild the founder's ledger as
 * it stood the moment before that task, then run the same deterministic rules
 * production runs (lib/today/rules.ts). Used by the admin Today-quality card to
 * vet a new rule against real data BEFORE it ships, and by the regression tests.
 */

import { buildLedger, type FeedbackRow, type ReflectionText } from "@/lib/today/facts";
import { guardRules, type GuardRule } from "@/lib/today/rules";

export interface ReplayAction {
  created_at: string;
  action_shown: string;
  outcome?: string | null;
  user_id?: string | null;
}

export interface ReplayRow {
  at: string;
  who?: string | null;
  task: string;
  outcome: string | null;
  rules: GuardRule[];
}

export interface ReplayReport {
  total: number;
  flagged: number;
  flaggedPct: number;
  byRule: Record<string, number>;
  /** Flagged tasks the founder actually ignored/overrode: the guard agreed with the founder. */
  flaggedAndRejected: number;
  /** Flagged tasks the founder completed: possible false positives to review. */
  flaggedButCompleted: number;
  rows: ReplayRow[];
}

export function replay(
  actions: ReplayAction[],
  reflectionsByUser: Record<string, ReflectionText[]>,
  feedbackByUser: Record<string, FeedbackRow[]> = {},
): ReplayReport {
  const sorted = [...actions]
    .filter((a) => a?.action_shown && !Number.isNaN(Date.parse(a.created_at)))
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  const rows: ReplayRow[] = [];
  const byRule: Record<string, number> = {};
  for (const a of sorted) {
    const uid = a.user_id ?? "_";
    const t = Date.parse(a.created_at);
    const before = (reflectionsByUser[uid] ?? []).filter((r) => Date.parse(r.created_at) < t);
    const fb = (feedbackByUser[uid] ?? []).filter((f) => Date.parse(f.created_at) < t);
    const ledger = buildLedger(before, { now: t, feedback: fb });
    const rules = guardRules(a.action_shown, ledger);
    for (const r of rules) byRule[r] = (byRule[r] ?? 0) + 1;
    rows.push({ at: a.created_at, who: a.user_id ?? null, task: a.action_shown, outcome: a.outcome ?? null, rules });
  }

  const flaggedRows = rows.filter((r) => r.rules.length > 0);
  return {
    total: rows.length,
    flagged: flaggedRows.length,
    flaggedPct: rows.length ? Math.round((flaggedRows.length / rows.length) * 1000) / 10 : 0,
    byRule,
    flaggedAndRejected: flaggedRows.filter((r) => r.outcome === "ignored" || r.outcome === "overridden").length,
    flaggedButCompleted: flaggedRows.filter((r) => r.outcome === "completed").length,
    rows: rows.reverse(),
  };
}
