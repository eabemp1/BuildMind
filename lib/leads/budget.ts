/**
 * lib/leads/budget.ts: how much one Find Customers run may spend. Starting limits, to be tested before they harden:
 * 3 distinct queries, 4 provider calls (the 3 searches plus 1 places lookup), 5 page reads, 35 seconds of work.
 * Each can be tuned without a deploy (LEADS_QUERIES, LEADS_PAGES, LEADS_WORK_MS, LEADS_STOP_AT), and
 * LEADS_BUDGET=legacy restores the earlier, wider search at once. Pure.
 */
export interface LeadBudget {
  queries: number;         // distinct search queries across the whole run
  discussion: number;      // extra discussion-search queries (provider calls) on top of the above
  pages: number;           // pages opened across the whole run, including followed links
  workMs: number;          // work budget for the whole run
  roundReserveMs: number;  // a new round starts only if this much time is left
  stopAtDirect: number;    // stop searching once this many direct, verified leads exist
  follow: boolean;         // open links found on pages (a second hop)
}

const LEGACY: LeadBudget = { queries: 7, discussion: 2, pages: 10, workMs: Number.POSITIVE_INFINITY, roundReserveMs: 80_000, stopAtDirect: 8, follow: true };

const int = (v: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

export function leadBudget(light = false, env: Record<string, string | undefined> = process.env): LeadBudget {
  if (env.LEADS_BUDGET === "legacy") return LEGACY;
  const b: LeadBudget = {
    queries: int(env.LEADS_QUERIES, 3, 1, 7),
    discussion: 0,
    pages: int(env.LEADS_PAGES, 5, 1, 12),
    workMs: int(env.LEADS_WORK_MS, 35_000, 5_000, 240_000),
    roundReserveMs: 15_000,
    stopAtDirect: int(env.LEADS_STOP_AT, 3, 1, 12),
    follow: true,
  };
  // When the system is busy, search once, read less, and skip the second hop.
  return light ? { ...b, queries: Math.min(b.queries, 2), pages: Math.min(b.pages, 3), follow: false } : b;
}
