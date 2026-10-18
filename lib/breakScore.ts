/**
 * lib/breakScore.ts — the survival score on /break.
 *
 * The score used to be a number the model typed, and it anchored on the
 * example range in the prompt ("most ideas are 20-45%"), so almost every idea
 * came back as ~28. Now the model only rates seven dimensions from 0 to 5,
 * each with a written anchor, and the score is computed here from those. The
 * no-AI preview rates the same seven dimensions from the text, so a preview and
 * a live result are scored by the same formula and different ideas get
 * different numbers.
 */

export const DIMENSIONS = [
  "problem_severity", "target_clarity", "demand_evidence", "differentiation", "reachability", "monetization", "feasibility",
] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export type Signals = Record<Dimension, number>;

const WEIGHTS: Record<Dimension, number> = {
  problem_severity: 0.2, target_clarity: 0.15, demand_evidence: 0.15, differentiation: 0.15, reachability: 0.15, monetization: 0.1, feasibility: 0.1,
};

/** Anchors shown to the model so the full 0-5 range gets used. */
export const DIMENSION_GUIDE = `Rate each dimension as an integer 0-5, using the whole range. Judge only what the founder wrote; if it isn't there, score it low.
- problem_severity: 0 = no real problem named, 3 = a real but moderate annoyance, 5 = costly or urgent pain people already pay to avoid.
- target_clarity: 0 = "everyone", 3 = a segment but loosely defined, 5 = a specific person you could name and find tomorrow.
- demand_evidence: 0 = nothing beyond the founder's belief, 3 = some signal (conversations, waitlist), 5 = people paying or committed.
- differentiation: 0 = same as many existing tools, 3 = a noticeable angle, 5 = a clear reason to switch that incumbents can't easily copy.
- reachability: 0 = no cheap way to reach these users, 3 = a plausible channel, 5 = users gather in places the founder already is.
- monetization: 0 = no model, 3 = plausible model, 5 = clear buyer, price and willingness to pay.
- feasibility: 0 = needs a large team or capital, 3 = doable but heavy for one person, 5 = a solo founder can ship a first version in weeks.`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function normalizeSignals(raw: unknown): Signals | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as Signals;
  for (const d of DIMENSIONS) {
    const v = Number((raw as Record<string, unknown>)[d]);
    if (!Number.isFinite(v)) return null;
    out[d] = clamp(Math.round(v), 0, 5);
  }
  return out;
}

/** 5-92. Weighted dimensions, plus a small adjustment for how specific the description is. */
export function computeSurvival(signals: Signals, text = ""): number {
  const weighted = DIMENSIONS.reduce((sum, d) => sum + WEIGHTS[d] * (signals[d] / 5), 0);
  const specificity = clamp(Math.round((specificityOf(text) - 0.5) * 12), -6, 6);
  return clamp(Math.round(6 + weighted * 84 + specificity), 5, 92);
}

/** 0-1: how concrete the description is (length, numbers, named things). */
export function specificityOf(text: string): number {
  const t = (text ?? "").trim();
  if (!t) return 0;
  const words = t.split(/\s+/).length;
  const numbers = (t.match(/\b\d[\d,.%$k]*\b/g) ?? []).length;
  const named = (t.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).length;
  const vague = (t.match(/\b(platform|solution|ecosystem|revolutioni[sz]e|disrupt|innovative|seamless|all[- ]in[- ]one|ai[- ]powered|next[- ]gen)\b/gi) ?? []).length;
  return clamp(Math.min(words, 60) / 120 + Math.min(numbers, 3) * 0.1 + Math.min(named, 4) * 0.05 + 0.2 - vague * 0.12, 0, 1);
}

const has = (t: string, re: RegExp) => re.test(t);

/** The same seven ratings, from the text alone, for the no-AI preview. */
export function previewSignals(idea: string, users = "", problem = ""): Signals {
  const t = `${idea} ${users} ${problem}`;
  const lower = t.toLowerCase();
  const count = (re: RegExp) => (lower.match(re) ?? []).length;
  const c = (n: number) => clamp(Math.round(n), 0, 5);

  const painWords = count(/\b(waste|wasting|lose|losing|cost|costs|expensive|struggle|struggling|stuck|slow|manual|hours|risk|frustrat\w*|pain|can'?t|unable|miss(?:ing)?)\b/g);
  const problemSeverity = c(1 + (problem.trim().length > 12 ? 1.5 : 0) + Math.min(2, painWords * 0.7) + (has(lower, /\b\d+\s?(hours|%|\$|k\b|days)\b/) ? 0.8 : 0));

  const segment = has(lower, /\b(founders?|freelancers?|students?|nurses?|farmers?|teachers?|developers?|designers?|restaurants?|landlords?|creators?|agencies|smes?|clinics?|merchants?|sellers?|shops?|parents?|athletes?|accountants?|lawyers?|recruiters?|engineers?|marketers?)\b/);
  const vagueTarget = has(lower, /\b(everyone|anyone|all people|general public|businesses of all)\b/);
  const targetClarity = c(1 + (users.trim().length >= 12 ? 1.5 : 0) + (segment ? 1.5 : 0) + (has(lower, /\b(who|that)\s+(?:are|have|run|struggle)/) ? 0.5 : 0) + (/\bfor\s+[a-z]+(?:\s+[a-z]+){1,4}/.test(lower) ? 0.5 : 0) - (vagueTarget ? 2 : 0));

  const demand = c(count(/\b(talked to|spoke (?:to|with)|interview\w*|waitlist|pre-?order\w*|paying|paid|customers?\s+(?:said|asked)|users?\s+(?:said|asked)|beta|signups?|sign-ups?|pilot)\b/g) * 1.4 + (has(lower, /\b\d{2,}\s+(users|customers|signups|people|founders)\b/) ? 1.5 : 0));

  const generic = has(lower, /\b(uber for|airbnb for|marketplace|social network|all[- ]in[- ]one|platform for everything|ai[- ]powered platform)\b/);
  const differentiation = c(1 + count(/\b(unlike|instead of|only|first|without|no need|specifically|niche|local|african|ghana|nigeria|kenya|offline|whatsapp)\b/g) * 0.8 + (specificityOf(t) > 0.45 ? 0.8 : 0) - (generic ? 1.2 : 0));

  const channels = count(/\b(whatsapp|linkedin|reddit|twitter|x\.com|community|communities|campus|newsletter|discord|slack|telegram|facebook group|hub|meetup|church|market)\b/g);
  const reachability = c(1 + Math.min(2.5, channels * 1.1) + (segment ? 1 : 0) - (vagueTarget ? 1 : 0));

  const monetization = c(1 + (has(lower, /\b(subscription|monthly|per month|pricing|price|pay|paid|charge|fee|commission|\$\d+)\b/) ? 2.5 : 0) + (has(lower, /\b(b2b|businesses|companies|teams|agencies|clinics)\b/) ? 0.8 : 0));

  const heavy = has(lower, /\b(hardware|blockchain|crypto exchange|bank|insurance|biotech|satellite|drone|two[- ]sided|marketplace|social network|regulated|licen[cs]e)\b/);
  const light = has(lower, /\b(tool|template|dashboard|bot|plugin|extension|script|app|newsletter|checklist|calculator)\b/);
  const feasibility = c(3 + (light ? 1 : 0) - (heavy ? 2 : 0) + (words(idea) > 80 ? -1 : 0));

  return { problem_severity: problemSeverity, target_clarity: targetClarity, demand_evidence: demand, differentiation, reachability, monetization, feasibility };
}

function words(s: string): number { return s.split(/\s+/).filter(Boolean).length; }

export function previewScore(idea: string, users = "", problem = ""): number {
  return computeSurvival(previewSignals(idea, users, problem), `${idea} ${users} ${problem}`);
}
