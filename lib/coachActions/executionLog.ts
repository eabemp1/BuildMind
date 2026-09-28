/**
 * lib/coachActions/executionLog.ts
 *
 * The execution record: every Today action BuildMind logged for the founder,
 * with what happened to it. Raw and dated on purpose — this is the ground
 * truth the weekly pulse's "X of Y" is derived from, so when the two ever
 * disagree this is the place to see why (was the completion recorded at all?
 * under which path? on which day?).
 *
 * Only Today's own rows are included — see lib/todayFlowSessions.ts. The
 * table is shared with the coach, weekly reports, morning briefings, etc.
 * Columns are exactly those in supabase/migrations/…reflexion_learning_log.sql.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTodayFlowSession, todayFlowSource } from "@/lib/todayFlowSessions";
import { actionCategoryLabel } from "@/lib/actionClassification";
import { toCSV } from "./csv";

export type LogOutcome = "completed" | "partial" | "skipped" | "ignored" | "pending";

export interface ExecutionLogRow {
  id: string;
  session_id: string | null;
  action_shown: string | null;
  action_type: string | null;
  outcome: string | null;
  created_at: string;
  outcome_recorded_at: string | null;
  outcome_note: string | null;
}

export interface ExecutionLogEntry {
  id: string;
  action: string;
  category: string;
  actionType: string | null;
  outcome: LogOutcome;
  /** "today" = the row created when Today recommended it; "fallback" = the
   *  row task-complete wrote because it had no shown row to update. */
  source: "today" | "fallback";
  shownAt: string;
  outcomeRecordedAt: string | null;
  /** When it happened: the outcome time if there is one, else when it was shown. */
  effectiveAt: string;
  note: string | null;
}

export interface ExecutionLogView {
  entries: ExecutionLogEntry[];
  windowDays: number;
  counts: Record<LogOutcome, number>;
  daysWithCompletion: number;
  truncated: boolean;
}

export type FetchExecutionLogResult =
  | { ok: true; rows: ExecutionLogRow[]; truncated: boolean }
  | { ok: false; status: number; error: string };

const DAY_MS = 86_400_000;
const FETCH_CAP = 1000;
// Fetch a little earlier than the window so a row SHOWN just before the edge
// but COMPLETED inside it is still seen — the window is applied afterward on
// when things happened (effectiveAt), not when they were created.
const FETCH_SLACK_DAYS = 3;

export function normalizeOutcome(raw: string | null | undefined): LogOutcome {
  switch (raw) {
    case "completed": return "completed";
    case "partial": return "partial";
    case "overridden": return "skipped";
    case "ignored": return "ignored";
    default: return "pending";
  }
}

export async function fetchExecutionLog(
  admin: SupabaseClient, userId: string, days: number, now: Date = new Date(),
): Promise<FetchExecutionLogResult> {
  const since = new Date(now.getTime() - (days + FETCH_SLACK_DAYS) * DAY_MS).toISOString();
  const { data, error } = await admin
    .from("reflexion_learning_log")
    .select("id, session_id, action_shown, action_type, outcome, created_at, outcome_recorded_at, outcome_note")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);
  if (error) return { ok: false, status: 500, error: `Couldn't load your execution log: ${error.message}` };
  const rows = (data ?? []) as ExecutionLogRow[];
  return { ok: true, rows, truncated: rows.length >= FETCH_CAP };
}

/** Pure — `now` injected. */
export function shapeExecutionLog(rows: ExecutionLogRow[], days: number, now: Date = new Date(), truncated = false): ExecutionLogView {
  const windowStart = now.getTime() - days * DAY_MS;
  const entries: ExecutionLogEntry[] = rows
    .filter((r) => isTodayFlowSession(r.session_id))
    .map((r) => {
      const outcome = normalizeOutcome(r.outcome);
      const recorded = outcome === "pending" ? null : r.outcome_recorded_at ?? null;
      const action = (r.action_shown ?? "").trim() || "(untitled action)";
      return {
        id: r.id,
        action,
        category: actionCategoryLabel(action),
        actionType: r.action_type,
        outcome,
        source: todayFlowSource(r.session_id),
        shownAt: r.created_at,
        outcomeRecordedAt: recorded,
        effectiveAt: recorded ?? r.created_at,
        note: r.outcome_note ?? null,
      } satisfies ExecutionLogEntry;
    })
    .filter((e) => {
      const t = new Date(e.effectiveAt).getTime();
      return Number.isFinite(t) && t >= windowStart;
    })
    .sort((a, b) => new Date(b.effectiveAt).getTime() - new Date(a.effectiveAt).getTime());

  const counts: Record<LogOutcome, number> = { completed: 0, partial: 0, skipped: 0, ignored: 0, pending: 0 };
  for (const e of entries) counts[e.outcome] += 1;
  const completedDays = new Set(entries.filter((e) => e.outcome === "completed").map((e) => e.effectiveAt.slice(0, 10)));

  return { entries, windowDays: days, counts, daysWithCompletion: completedDays.size, truncated };
}

export function executionLogToCSV(entries: ExecutionLogEntry[]): string {
  return toCSV(
    ["when", "outcome", "action", "category", "source", "shown_at", "outcome_recorded_at", "note"],
    entries.map((e) => [e.effectiveAt, e.outcome, e.action, e.category, e.source, e.shownAt, e.outcomeRecordedAt ?? "", e.note ?? ""]),
  );
    }
