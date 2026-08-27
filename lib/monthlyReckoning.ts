/**
 * lib/monthlyReckoning.ts — Pure staleness detection for The Reckoning.
 *
 * WHY THIS EXISTS: Weekly Vigil (weekly_goals) is pace-tracking against a
 * target the founder set. The Reckoning is a different claim entirely —
 * "this goal has gone stale, decide now: revive it or kill it" — and that
 * claim needs to come from real, checkable activity data, not a vibe. Same
 * discipline as lib/milestonePacing.ts and lib/patternGrading.ts: a
 * founder will treat this as authoritative, so it's a pure function of
 * real inputs, unit-testable without touching Supabase.
 *
 * STALENESS RULE: a milestone qualifies when ALL of:
 *   1. status is 'pending' or 'in_progress' (not completed/abandoned —
 *      those aren't stale, they're resolved)
 *   2. it's been at least `staleDaysThreshold` days since it was CREATED
 *      (a goal from 3 days ago isn't stale, it's just new)
 *   3. it's been at least `staleDaysThreshold` days since any real
 *      activity — the most recent COMPLETED task under it, falling back to
 *      the milestone's own updated_at if it has no tasks at all
 *
 * Among qualifying milestones, the single MOST stale one is picked — this
 * product's whole pattern is one thing at a time (one Today action, one
 * weekly goal), not a list to triage.
 */

export interface MilestoneActivityInput {
  id: string;
  title: string;
  status: string; // milestones.status
  createdAt: string; // milestones.created_at
  updatedAt: string; // milestones.updated_at
  lastTaskCompletedAt: string | null; // most recent completed task under this milestone, if any
}

export interface StaleGoal {
  id: string;
  title: string;
  daysSinceActivity: number;
  daysSinceCreated: number;
}

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES = new Set(["pending", "in_progress"]);

export function findStaleGoal(
  milestones: MilestoneActivityInput[],
  now: Date = new Date(),
  staleDaysThreshold = 21,
): StaleGoal | null {
  const candidates = milestones
    .filter((m) => ACTIVE_STATUSES.has(m.status))
    .map((m) => {
      const createdAt = new Date(m.createdAt).getTime();
      const lastActivityRaw = m.lastTaskCompletedAt ?? m.updatedAt;
      const lastActivity = new Date(lastActivityRaw).getTime();
      const daysSinceCreated = Math.floor((now.getTime() - createdAt) / DAY_MS);
      const daysSinceActivity = Math.floor((now.getTime() - lastActivity) / DAY_MS);
      return { m, daysSinceCreated, daysSinceActivity };
    })
    .filter((c) => c.daysSinceCreated >= staleDaysThreshold && c.daysSinceActivity >= staleDaysThreshold);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);
  const top = candidates[0];
  return {
    id: top.m.id,
    title: top.m.title,
    daysSinceActivity: top.daysSinceActivity,
    daysSinceCreated: top.daysSinceCreated,
  };
}

/** Returns the ISO date string for the 1st of the month containing `d`. */
export function monthStart(d: Date): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
