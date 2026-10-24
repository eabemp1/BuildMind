/**
 * Stale task scoping. An open task nobody has touched for STALE_TASK_DAYS is not "pending work" any more: it is
 * history. Counting it makes the backlog look like 33 live commitments when most are months old, and that
 * bloats the context the daily-task planner reads. The row is NOT deleted or changed: it stays visible in the
 * backlog list and export; it is only left out of the "pending now" count and the planner context.
 */
export const STALE_TASK_DAYS = 30;

interface TaskLike { is_completed?: boolean | null; status?: string | null; created_at?: string | null; updated_at?: string | null; completed_at?: string | null }

/** When the task was last touched. updated_at moves on any edit, so created_at is the floor. */
export function lastTouched(t: TaskLike): number | null {
  const v = t.updated_at ?? t.created_at ?? null;
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function isStaleOpenTask(t: TaskLike, now: Date, days = STALE_TASK_DAYS): boolean {
  if (t.is_completed || t.status === "completed") return false;
  const touched = lastTouched(t);
  if (touched === null) return false; // no timestamp: never guess a task is stale
  return (now.getTime() - touched) / 86_400_000 >= days;
}

/** The moment a finished task was finished: completed_at when it exists, otherwise the last touch. */
export function completionTime(t: TaskLike): number | null {
  if (!t.is_completed && t.status !== "completed") return null;
  const v = t.completed_at ?? t.updated_at ?? t.created_at ?? null;
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}
