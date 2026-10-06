/**
 * lib/breakGuards.ts — keeps Break My Startup from saying things its evidence
 * cannot support.
 *
 * 1. Founder traits. "No focus areas selected" once became "the founder lacks
 *    the discipline to build this", followed by advice to hire a product
 *    manager. One product interaction cannot establish a stable trait. Claims
 *    about the founder's character or ability are dropped unless the project
 *    has real behavioural history.
 * 2. Risk categories. Categories were assigned by list position, so the third
 *    risk was always called "Moat Risk" whatever it said. They now come from the
 *    text, and anything unclear is called a general risk.
 */

const TRAIT_PATTERNS: RegExp[] = [
  /\b(lacks?|lacking|without)\s+(the\s+)?(discipline|focus|commitment|grit|skills?|experience|ability)\b/i,
  /\bfounder\s+(admits|lacks|is unable|cannot|can't|is not capable|may not be able)\b/i,
  /\b(unable|unlikely|may lack the\s+\w+)\s+to\s+(build|execute|iterate|deliver)\b/i,
  /\bhire\s+(an?\s+)?(experienced\s+)?(product manager|cto|developer|co-?founder)\b/i,
  /\bbring\s+on\s+(an?\s+)?(co-?founder|partner)\b/i,
  /\bthe founder'?s?\s+(character|personality|work ethic|mindset)\b/i,
];

export function isUnsupportedFounderTraitClaim(text: string): boolean {
  return TRAIT_PATTERNS.some((p) => p.test(text));
}

/** Removes character and ability claims unless there is longitudinal behaviour behind them. */
export function stripUnsupportedTraitClaims(items: string[], hasBehaviourHistory: boolean): string[] {
  if (hasBehaviourHistory) return items;
  return items.filter((t) => !isUnsupportedFounderTraitClaim(t));
}

export type RiskCategory =
  | "Market risk" | "Revenue risk" | "Competitive risk" | "Moat risk" | "Execution risk" | "Timing risk" | "Regulatory risk" | "General risk";

const CATEGORY_RULES: Array<[RiskCategory, RegExp]> = [
  ["Moat risk", /\b(moat|defensib\w*|copy|copied|replicat\w*|commodit\w*|switching cost|network effect)\b/i],
  ["Competitive risk", /\b(competitor|incumbent|crowded|saturat\w*|alternative|already (solve|serve)|market leader)\b/i],
  ["Revenue risk", /\b(pay|price|pricing|revenue|monetiz\w*|margin|churn|willingness|budget|unit economics)\b/i],
  ["Market risk", /\b(demand|market size|customers?|users?\b.*\b(want|need)|problem|pain|adoption)\b/i],
  ["Timing risk", /\b(timing|too early|too late|trend|window)\b/i],
  ["Regulatory risk", /\b(regulat\w*|compliance|gdpr|licen[cs]\w*|legal|privacy law)\b/i],
  ["Execution risk", /\b(build|ship|team|technical|resource|capacity|engineer|deliver|scope)\b/i],
];

export function classifyRiskCategory(text: string): RiskCategory {
  for (const [cat, re] of CATEGORY_RULES) if (re.test(text)) return cat;
  return "General risk";
}
