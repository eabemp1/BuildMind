/**
 * lib/billing/cancellation.ts
 *
 * Pure rules for what happens to a paid user's access when they cancel.
 *
 * Principle: you paid for the period, you keep the period. Cancelling stops
 * the NEXT charge; it never takes away time that was already paid for. Access
 * ends on its own at the end of the period (lib/server/plan.ts already returns
 * Free once current_period_end has passed), so no cron job is needed.
 */

export type AccessDecision =
  | { mode: "until_period_end"; accessUntil: string }
  | { mode: "immediate" };

/**
 * If the paid period has not ended yet, access continues until it does.
 * If we do not know when it ends (or it already ended) there is nothing left
 * to honour, so access ends now.
 */
export function decideAccessAfterCancel(periodEnd: string | null | undefined, now: Date = new Date()): AccessDecision {
  if (!periodEnd) return { mode: "immediate" };
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime()) || end.getTime() <= now.getTime()) return { mode: "immediate" };
  return { mode: "until_period_end", accessUntil: end.toISOString() };
}

/** "12 November 2026" - the same style used in BuildMind's emails. */
export function formatAccessDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Days of Builder access left after a failed payment before we step in. */
export const PAYMENT_GRACE_DAYS = 3;
