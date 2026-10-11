/**
 * lib/inactivity.ts - one definition of "days inactive" and "days since momentum moved".
 *
 * founder_context.days_inactive is a stored counter that only the evening-check cron
 * advances, and that cron only visits paid founders with push enabled. Everyone else's
 * counter froze, so win-back emails, recovery mode and the Cofounder Pulse "stalled"
 * state disagreed with reality. Derive it from the activity dates instead.
 */

const DAY_MS = 86_400_000;

function dayNumber(v: unknown): number | null {
  if (typeof v !== "string" || v.length < 10) return null;
  const t = Date.parse(`${v.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : null;
}

export interface ActivityDates {
  last_active?: string | null;
  last_checkin_date?: string | null;
  last_task_date?: string | null;
}

/** Whole UTC days since the founder last did anything. null when no date is known. */
export function daysSinceLastActivity(ctx: ActivityDates | null | undefined, now: Date = new Date()): number | null {
  if (!ctx) return null;
  const days = [dayNumber(ctx.last_active), dayNumber(ctx.last_checkin_date), dayNumber(ctx.last_task_date)].filter(
    (d): d is number => d !== null,
  );
  if (days.length === 0) return null;
  const today = Math.floor(now.getTime() / DAY_MS);
  return Math.max(0, today - Math.max(...days));
}

/**
 * Days between momentum's last write and now, minimum 1. This is what the EMA's
 * `daysSinceLastUpdate` means. Passing the cumulative inactive-day count instead
 * (what the nightly decay did) re-applies the whole gap every night, so decay
 * accelerates: a founder at 70 hit the floor of 20 after about 3 quiet nights
 * while Recovery Mode's own projection promised ~29.
 */
export function daysSinceMomentumUpdate(updatedAt: string | null | undefined, now: Date = new Date()): number {
  if (!updatedAt) return 1;
  const t = Date.parse(updatedAt);
  if (!Number.isFinite(t)) return 1;
  return Math.max(1, Math.round((now.getTime() - t) / DAY_MS));
}
