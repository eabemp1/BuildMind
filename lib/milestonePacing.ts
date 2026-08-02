/**
 * lib/milestonePacing.ts — Pure milestone pacing math
 *
 * WHY THIS EXISTS: the weekly-pulse story synthesis needs to say things like
 * "Beta Launch is pacing 2 days ahead of schedule." That date/delta must
 * come from a real, deterministic calculation — never from the LLM
 * eyeballing a date. This is the exact class of bug lib/momentum.ts's v2
 * redesign and app/api/ai/weekly-report/route.ts's momentum-number fix both
 * had to correct after the fact: a narrative stating a number that didn't
 * match the real, authoritative value. Get it right here once, up front.
 *
 * All functions are pure — no Supabase imports, no side effects,
 * unit-testable in isolation (see __tests__/lib/momentum.test.ts for the
 * pattern this follows).
 *
 * MODEL: linear pacing against elapsed time.
 *   expectedProgress = daysElapsed / daysTotal        (where you "should" be)
 *   actualProgress   = tasksCompleted / tasksTotal    (where you actually are)
 *   projectedFinish  = createdAt + (daysElapsed / actualProgress)
 *
 * This is intentionally simple (linear, not weighted by task difficulty —
 * see the NOTE below on why difficulty isn't factored in yet). Simple and
 * honest beats sophisticated and wrong for a number a founder will read as
 * an authoritative deadline.
 *
 * NOTE ON TASK DIFFICULTY: an earlier design assumed tasks have a stored
 * difficulty rating and could weight this calculation by it. Confirmed by
 * reading the schema and every call site: they don't. `tasks.priority` is
 * the only per-task numeric field (default 5), and its higher/lower
 * convention isn't documented anywhere I found — do NOT treat it as a
 * difficulty proxy without confirming that convention first. The only real
 * "difficulty" signal in the codebase today is `isHardTask` in
 * app/api/founder-context/task-complete/route.ts, and that's a per-PROJECT-
 * STAGE flag (stage includes "launch"/"revenue"/"growth"), not a per-task
 * rating — it can't tell you which 3 of this week's 13 tasks were hard.
 * If a "3 high-difficulty tasks" stat is wanted, it needs a real per-task
 * difficulty source first (e.g. classified at creation time), not reused
 * from here.
 */

export type PacingRisk = "low" | "medium" | "high" | "unknown";

export interface MilestonePacingInput {
  id: string;
  title: string;
  targetDate: string | null;   // milestones.target_date
  createdAt: string;           // milestones.created_at
  status: string;              // milestones.status
  tasksTotal: number;          // count of tasks under this milestone
  tasksCompleted: number;      // count of those with status = 'completed'
}

export interface MilestonePacingResult {
  id: string;
  title: string;
  targetDate: string | null;
  projectedDate: string | null;   // ISO date string, null if not computable
  deltaDays: number | null;       // negative = ahead of schedule, positive = behind
  risk: PacingRisk;
  reason: string;                 // short, human explanation of the risk band
}

const DAY_MS = 86_400_000;

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY_MS);
}

/**
 * computeMilestonePacing — the single function that should be called for
 * every non-completed milestone with a target_date. Returns `risk: "unknown"`
 * (never a guess) whenever there isn't enough real data to compute pacing —
 * e.g. zero tasks logged yet, or no target_date set.
 */
export function computeMilestonePacing(
  m: MilestonePacingInput,
  now: Date = new Date(),
): MilestonePacingResult {
  const base: Pick<MilestonePacingResult, "id" | "title" | "targetDate"> = {
    id: m.id,
    title: m.title,
    targetDate: m.targetDate,
  };

  if (m.status === "completed") {
    return { ...base, projectedDate: null, deltaDays: null, risk: "low", reason: "Already completed." };
  }
  if (!m.targetDate) {
    return { ...base, projectedDate: null, deltaDays: null, risk: "unknown", reason: "No target date set." };
  }

  const createdAt = new Date(m.createdAt);
  const targetDate = new Date(m.targetDate);
  const daysElapsed = Math.max(0, daysBetween(createdAt, now));
  const daysTotal = Math.max(1, daysBetween(createdAt, targetDate));

  // No tasks logged yet under this milestone — can't derive a real velocity.
  // Flag as unknown rather than assuming a date, unless we're already past
  // the deadline with literally nothing done (that's a real, knowable risk).
  if (m.tasksTotal === 0 || m.tasksCompleted === 0) {
    if (daysElapsed >= daysTotal) {
      return {
        ...base,
        projectedDate: null,
        deltaDays: null,
        risk: "high",
        reason: "Target date has passed with no completed tasks logged yet.",
      };
    }
    return {
      ...base,
      projectedDate: null,
      deltaDays: null,
      risk: "unknown",
      reason: "Not enough task data yet to project a completion date.",
    };
  }

  const actualProgress = m.tasksCompleted / Math.max(1, m.tasksTotal);
  // Guard divide-by-zero: if daysElapsed is 0 (created today), use 1 day
  // minimum so the projection isn't infinite/undefined on day one.
  const effectiveDaysElapsed = Math.max(1, daysElapsed);
  const impliedTotalDays = effectiveDaysElapsed / actualProgress;
  const projected = new Date(createdAt.getTime() + impliedTotalDays * DAY_MS);
  const deltaDays = daysBetween(targetDate, projected); // positive = late, negative = early

  let risk: PacingRisk;
  let reason: string;
  if (deltaDays <= 0) {
    risk = "low";
    reason = deltaDays < 0
      ? `Pacing ${Math.abs(deltaDays)} day${Math.abs(deltaDays) === 1 ? "" : "s"} ahead of schedule.`
      : "On pace to hit the target date.";
  } else if (deltaDays <= 5) {
    risk = "medium";
    reason = `Pacing ${deltaDays} day${deltaDays === 1 ? "" : "s"} behind — recoverable with a strong week.`;
  } else {
    risk = "high";
    reason = `Pacing ${deltaDays} days behind at current velocity — target date is unlikely without a change in pace.`;
  }

  return {
    ...base,
    projectedDate: projected.toISOString().slice(0, 10),
    deltaDays,
    risk,
  };
}
