/**
 * lib/radar/autoRun.ts - who the automatic Radar search runs for, and when. Pure.
 *
 * The scheduler fires on four days a week (Tue, Wed, Fri, Sat) and each founder is searched at most once
 * per MIN_GAP_DAYS, so everyone lands on about two searches a week and a founder missed on Tuesday (the
 * run ran out of time) is caught on Wednesday.
 */

export const MIN_GAP_DAYS = 2;
export const MAX_USERS_PER_RUN = 30;
export const RUN_BUDGET_MS = 100_000;

export interface SubscriptionRow { user_id?: string; plan?: string | null; status?: string | null; current_period_end?: string | null; grace_period_ends_at?: string | null }

/**
 * Automatic searches cost search and AI credits, so they are for paying founders only: a Builder
 * subscription that is active (or in its grace period) and not past its period end. Free users and
 * trials are not included. Mirrors the rules in lib/server/plan.ts without its extra lookups.
 */
export function isPaidSubscription(row: SubscriptionRow | null | undefined, now: Date = new Date()): boolean {
  if (!row || row.plan !== "builder") return false;
  const status = String(row.status ?? "").toLowerCase();
  if (status === "grace") {
    const g = Date.parse(row.grace_period_ends_at ?? "");
    return Number.isFinite(g) && g > now.getTime();
  }
  if (status !== "active") return false;
  const end = Date.parse(row.current_period_end ?? "");
  return !(Number.isFinite(end) && end <= now.getTime());
}

export interface AutoCandidate { user_id: string; auto_discover?: boolean | null; last_auto_run_at?: string | null }

/** Oldest-searched first; never-searched founders go first; opted-out and recently searched founders are skipped. */
export function pickAutoRunUsers(candidates: AutoCandidate[], now: Date = new Date(), limit = MAX_USERS_PER_RUN): string[] {
  const cutoff = now.getTime() - MIN_GAP_DAYS * 86_400_000;
  const seen = new Set<string>();
  const due: Array<{ id: string; t: number }> = [];
  for (const c of candidates ?? []) {
    if (!c?.user_id || seen.has(c.user_id)) continue;
    seen.add(c.user_id);
    if (c.auto_discover === false) continue;
    const t = c.last_auto_run_at ? Date.parse(c.last_auto_run_at) : 0;
    if (Number.isFinite(t) && t > cutoff) continue;
    due.push({ id: c.user_id, t: Number.isFinite(t) ? t : 0 });
  }
  return due.sort((a, b) => a.t - b.t).slice(0, Math.max(0, limit)).map((d) => d.id);
}

/** "2 days ago", "today": for the Today bar. */
export function sinceLabel(iso: string | null | undefined, now: Date = new Date()): string | null {
  const t = Date.parse(iso ?? "");
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((now.getTime() - t) / 86_400_000);
  if (days <= 0) return "today";
  return days === 1 ? "yesterday" : `${days} days ago`;
}
