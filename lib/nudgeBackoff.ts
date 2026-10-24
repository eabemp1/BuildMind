/**
 * lib/nudgeBackoff.ts — nudges get rarer the longer a founder has been quiet.
 *
 * A daily "you've been away" message for two weeks is pressure, and pressure is what makes a tired
 * person leave for good. Derived purely from days inactive, so it needs no extra state and gives the
 * same answer on every cron run:
 *   1-3 days quiet  -> every day (a gentle, normal nudge)
 *   4-7 days        -> every other day
 *   8-14 days       -> every third day
 *   15+ days        -> none here (the 7- and 14-day win-back emails in the re-engage cron take over)
 */
export function shouldSendNudge(daysInactive: number): boolean {
  const d = Math.floor(daysInactive);
  if (!Number.isFinite(d) || d <= 0) return true;
  if (d <= 3) return true;
  if (d <= 7) return d % 2 === 0;
  if (d <= 14) return d % 3 === 2; // 8, 11, 14
  return false;
}
