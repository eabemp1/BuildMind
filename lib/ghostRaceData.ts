/**
 * lib/ghostRaceData.ts — loads finished-action history for the Ghost Race.
 *
 * Source: the same two tables the rest of Progress already trusts.
 * reflexion_learning_log (Today's own rows only, see todayFlowSessions) and
 * action_logs, both written by /api/founder-context/task-complete. A day's
 * count is the larger of the two, so a completion that only one write caught
 * still counts once and is never counted twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isTodayFlowSession } from "@/lib/todayFlowSessions";
import type { WeekRecord } from "@/lib/ghostRace";

export const GHOST_LOOKBACK_WEEKS = 12;

export function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  const diff = d.getUTCDay() === 0 ? -6 : 1 - d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Pure: turn dated completions into Monday-first week records. */
export function bucketWeeks(
  learningDays: string[],
  actionLogDays: string[],
  thisWeekStart: string,
  weeks = GHOST_LOOKBACK_WEEKS,
): { completed: WeekRecord[]; current: WeekRecord } {
  const count = (days: string[]) => {
    const m = new Map<string, number>();
    for (const d of days) m.set(d, (m.get(d) ?? 0) + 1);
    return m;
  };
  const a = count(learningDays);
  const b = count(actionLogDays);
  const perDate = (date: string) => Math.max(a.get(date) ?? 0, b.get(date) ?? 0);

  const make = (weekStart: string): WeekRecord => {
    const perDay = Array.from({ length: 7 }, (_, i) => perDate(addDays(weekStart, i)));
    return { weekStart, perDay, total: perDay.reduce((s, n) => s + n, 0) };
  };
  const completed: WeekRecord[] = [];
  for (let k = weeks; k >= 1; k--) completed.push(make(addDays(thisWeekStart, -7 * k)));
  // Drop leading empty weeks (before the founder started) so history begins at the first real one.
  const firstActive = completed.findIndex((w) => w.total > 0);
  return { completed: firstActive === -1 ? [] : completed.slice(firstActive), current: make(thisWeekStart) };
}

export async function loadGhostWeeks(
  admin: SupabaseClient,
  userId: string,
  thisWeekStart: string,
): Promise<{ completed: WeekRecord[]; current: WeekRecord }> {
  const since = `${addDays(thisWeekStart, -7 * GHOST_LOOKBACK_WEEKS)}T00:00:00.000Z`;
  const [learning, logs] = await Promise.allSettled([
    admin.from("reflexion_learning_log").select("outcome, session_id, created_at, outcome_recorded_at").eq("user_id", userId).eq("outcome", "completed").gte("created_at", since),
    admin.from("action_logs").select("outcome, created_at").eq("user_id", userId).eq("outcome", "completed").gte("created_at", since),
  ]);
  const learningDays =
    learning.status === "fulfilled"
      ? ((learning.value.data ?? []) as Array<{ session_id?: string | null; created_at?: string | null; outcome_recorded_at?: string | null }>)
          .filter((r) => isTodayFlowSession(r.session_id))
          .map((r) => (r.outcome_recorded_at ?? r.created_at ?? "").slice(0, 10))
          .filter(Boolean)
      : [];
  const logDays =
    logs.status === "fulfilled"
      ? ((logs.value.data ?? []) as Array<{ created_at?: string | null }>).map((r) => (r.created_at ?? "").slice(0, 10)).filter(Boolean)
      : [];
  return bucketWeeks(learningDays, logDays, thisWeekStart);
}
