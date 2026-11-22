/**
 * lib/radar/budget.ts: how much one Radar discovery may spend, and the rules a found date must pass. Pure.
 * An automatic (cron) run is small: 2 queries, 3 page reads. The founder's own button keeps the wider search.
 * Tunable without a deploy: RADAR_AUTO_QUERIES, RADAR_AUTO_READS.
 */
export type RadarMode = "auto" | "manual";
export interface RadarBudget { queries: number; reads: number }

const num = (v: string | undefined, d: number, lo: number, hi: number) => { const n = Number(v); return v && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d; };

export function radarBudget(mode: RadarMode, env: Record<string, string | undefined> = process.env): RadarBudget {
  return mode === "auto" ? { queries: num(env.RADAR_AUTO_QUERIES, 2, 1, 4), reads: num(env.RADAR_AUTO_READS, 3, 1, 6) } : { queries: 4, reads: 6 };
}

/** True only when the page text itself states the year of the date (not just a day and month the system filled in). */
export function yearConfirmed(isoDate: string | null | undefined, pageText: string): boolean {
  const y = /^(\d{4})-\d{2}-\d{2}/.exec(isoDate ?? "")?.[1];
  return !!y && new RegExp(`(?:^|[^0-9])${y}(?:[^0-9]|$)`).test(pageText);
}

/** A list or roundup of many opportunities is a secondary source: the founder should apply on the organiser's own page. */
export function isRoundup(title: string, url: string): boolean {
  return /\b(top|best)\s+\d+\b|\b\d+\s+(best|top|upcoming)\b|\blist of\b|\broundup\b|\bupcoming (events|hackathons|conferences|grants|accelerators)\b/i.test(title)
    || /\/(blog|news|articles?|lists?|top-\d+)(\/|$)/i.test(url);
}
