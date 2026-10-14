/**
 * lib/distribution/experiments.ts — comparing experiments without fooling yourself.
 *
 * Raw engagement totals never decide a winner. The primary outcome is people:
 * qualified founders, activations and paid conversions, relative to reach.
 * A leader is only named when sample size is adequate and the Wilson 95%
 * intervals do not overlap.
 */
export interface Experiment {
  id: string;
  hypothesis: string;
  segment?: string | null;
  platform: string;
  variant?: string | null;
  status: string;
  impressions: number | null;
  replies: number | null;
  meaningful_exchanges: number | null;
  profile_visits: number | null;
  qualified_founders: number | null;
  signups: number | null;
  activations: number | null;
  paid: number | null;
  observations?: string | null;
  ai_interpretation?: string | null;
  learning?: string | null;
  next_experiment?: string | null;
  metrics_as_of?: string | null;
  run_on?: string | null;
}

export const MIN_REACH = 100;
export const MIN_OUTCOMES = 3;

export function wilson(successes: number, n: number, z = 1.96): { rate: number; lo: number; hi: number } {
  if (n <= 0) return { rate: 0, lo: 0, hi: 0 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { rate: p, lo: Math.max(0, (c - m) / d), hi: Math.min(1, (c + m) / d) };
}

/** People who mattered, as entered by the founder. */
export function outcomes(e: Experiment): number {
  return (e.qualified_founders ?? 0) + (e.activations ?? 0) + (e.paid ?? 0);
}

export function missingEvidence(e: Experiment): string[] {
  const m: string[] = [];
  if (e.impressions == null) m.push("impressions (reach)");
  if (e.meaningful_exchanges == null) m.push("meaningful exchanges");
  if (e.qualified_founders == null) m.push("qualified founders");
  if (e.signups == null && e.activations == null) m.push("signups / activations (needs attribution)");
  if (!e.observations?.trim()) m.push("your qualitative notes");
  return m;
}

export type Confidence = "insufficient" | "low" | "moderate";

export function confidenceOf(e: Experiment): { level: Confidence; reason: string } {
  const n = e.impressions ?? 0;
  if (n < MIN_REACH) return { level: "insufficient", reason: `Fewer than ${MIN_REACH} impressions recorded, so rates are mostly noise.` };
  if (outcomes(e) < MIN_OUTCOMES) return { level: "low", reason: `Fewer than ${MIN_OUTCOMES} qualified outcomes. One person changes the rate a lot.` };
  return { level: "moderate", reason: "Enough reach and outcomes to compare, not to prove." };
}

export interface Comparison {
  verdict: "insufficient" | "no_clear_difference" | "leader";
  leaderId?: string;
  reason: string;
  rows: { id: string; n: number; outcomes: number; rate: number; lo: number; hi: number }[];
}

export function compareExperiments(list: Experiment[]): Comparison {
  const usable = list.filter((e) => e.impressions != null);
  const rows = usable.map((e) => ({ id: e.id, n: e.impressions as number, outcomes: outcomes(e), ...wilson(outcomes(e), e.impressions as number) }));
  if (rows.length < 2) return { verdict: "insufficient", reason: "Need at least two experiments with recorded reach to compare.", rows };
  if (rows.some((r) => r.n < MIN_REACH)) return { verdict: "insufficient", reason: `At least one experiment has under ${MIN_REACH} impressions. Totals are not comparable yet.`, rows };
  const total = rows.reduce((s, r) => s + r.outcomes, 0);
  if (total < MIN_OUTCOMES) return { verdict: "insufficient", reason: `Only ${total} qualified outcome${total === 1 ? "" : "s"} across these experiments. Too few to separate them.`, rows };
  const sorted = [...rows].sort((a, b) => b.rate - a.rate);
  const [top, next] = sorted;
  if (top.lo > next.hi && top.outcomes >= 2) return { verdict: "leader", leaderId: top.id, reason: "The leader's interval sits clear of the runner-up, with at least 2 qualified outcomes behind it.", rows };
  return { verdict: "no_clear_difference", reason: "The intervals overlap. Any gap could be chance. Collect more reach before choosing.", rows };
}

/** Rate-per-1000 helper for display. */
export const per1000 = (rate: number) => Math.round(rate * 10000) / 10;
