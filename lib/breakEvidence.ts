/**
 * lib/breakEvidence.ts — the Evidence & Reasoning layer for Break My Startup.
 *
 * The five agents each return opinions. Without a layer on top, a hunch from
 * one agent and a verified competitor page look equally authoritative, two
 * agents can contradict each other unnoticed, and "39/100" implies a precision
 * nothing supports. This module is deterministic (no extra model calls, no
 * added latency) and does four things with what the pipeline already has:
 *
 *   1. Labels every claim: evidence | inference | hypothesis | unknown
 *   2. Detects contradictions between agents and between agents and search
 *   3. Grades each competitor: verified | inferred | adjacent
 *   4. Turns the score into a range whose width reflects how thin the proof is
 *
 * and for each key assumption states what result would prove it wrong.
 */

import type {
  CompetitorOutput, MarketResearchOutput, RiskOutput, ScrapedCompetitor,
  SentimentOutput, TrendOutput,
} from "@/lib/agents";

export type ClaimKind = "evidence" | "inference" | "hypothesis" | "unknown";

export interface EvidenceClaim {
  claim: string;
  kind: ClaimKind;
  source: string;
  confidence: "low" | "medium" | "high";
}

export interface EvidenceConflict {
  title: string;
  sideA: { agent: string; says: string };
  sideB: { agent: string; says: string };
  howToSettle: string;
}

export interface CompetitorEvidence {
  name: string;
  quality: "verified" | "inferred" | "adjacent";
  note: string;
  url?: string;
}

export interface Falsifier {
  assumption: string;
  test: string;
  provenWrongIf: string;
}

export interface ConfidenceBand {
  score: number;
  low: number;
  high: number;
  grade: "thin" | "moderate" | "solid";
  why: string;
}

export interface EvidenceLayer {
  claims: EvidenceClaim[];
  conflicts: EvidenceConflict[];
  competitors: CompetitorEvidence[];
  confidence: ConfidenceBand;
  falsifiers: Falsifier[];
  unknowns: string[];
}

export interface EvidenceInput {
  viabilityScore: number;
  parsed?: { problem?: string; target_customer?: string; monetization?: string } | null;
  market: MarketResearchOutput | null;
  competitor: CompetitorOutput | null;
  trend: TrendOutput | null;
  sentiment: SentimentOutput | null;
  risk: RiskOutput | null;
  agentsSucceeded: number;
  analysisIsSynthetic?: boolean;
  scraped: ScrapedCompetitor[];
  competitorSource: string;          // "tavily" | "brave" | "ddg" | "ai_synthesised" | "none"
  /** Real evidence from the founder's own project (interviews, payments). */
  founderEvidenceCount?: number;
}

const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const present = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

function hostOf(url?: string): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

// ── Competitors ───────────────────────────────────────────────────────────

export function gradeCompetitors(input: EvidenceInput): CompetitorEvidence[] {
  const searchIsReal = input.competitorSource !== "ai_synthesised" && input.competitorSource !== "none";
  const scrapedByHost = new Map<string, ScrapedCompetitor>();
  for (const s of input.scraped) { const h = hostOf(s.url); if (h) scrapedByHost.set(h, s); }

  const out: CompetitorEvidence[] = [];
  const seen = new Set<string>();
  const push = (c: CompetitorEvidence) => {
    const k = c.name.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(c);
  };

  for (const d of input.competitor?.direct_competitors ?? []) {
    const h = hostOf(d.url);
    const hit = h ? scrapedByHost.get(h) : undefined;
    if (hit && searchIsReal) {
      push({ name: d.name, quality: "verified", url: d.url, note: `Found in live search (${h}). Weakness cited: ${clip(d.weakness, 90)}` });
    } else {
      push({ name: d.name, quality: "inferred", url: d.url, note: "Named by the competitor agent; not matched to a live search result. Check it exists and serves the same customer." });
    }
  }
  for (const name of input.competitor?.indirect_competitors ?? []) {
    if (present(name)) push({ name, quality: "adjacent", note: "Solves a nearby problem or serves the customer differently. Not a like-for-like rival." });
  }
  // Search hits the agent did not name still count as verified pages.
  for (const s of input.scraped) {
    if (!searchIsReal) break;
    const h = hostOf(s.url);
    if (!h) continue;
    if ([...seen].some(n => h.includes(n.replace(/\s+/g, "").toLowerCase()))) continue;
    push({ name: s.title || h, quality: "verified", url: s.url, note: `Appeared in live search (${h}). Relevance not yet confirmed.` });
    if (out.length >= 10) break;
  }
  return out.slice(0, 10);
}

// ── Contradictions ────────────────────────────────────────────────────────

export function detectConflicts(input: EvidenceInput, graded: CompetitorEvidence[]): EvidenceConflict[] {
  const { market, competitor, trend, sentiment } = input;
  const out: EvidenceConflict[] = [];
  const verified = graded.filter(c => c.quality === "verified").length;

  if (competitor?.saturation_level === "low" && verified >= 4) {
    out.push({
      title: "Competition: agent says open field, search found many players",
      sideA: { agent: "Competitor agent", says: "Saturation is low" },
      sideB: { agent: "Live search", says: `${verified} relevant products surfaced` },
      howToSettle: "Open each of the top 3 and check who they sell to. If they serve your exact customer, the field is crowded.",
    });
  }
  if (competitor?.saturation_level === "high" && input.scraped.length === 0 && input.competitorSource !== "none") {
    out.push({
      title: "Competition: agent says crowded, search found nothing",
      sideA: { agent: "Competitor agent", says: "Saturation is high" },
      sideB: { agent: "Live search", says: "No competitors returned" },
      howToSettle: "Search by the customer's problem, not by your product category. Ask 5 target users what they use today.",
    });
  }
  if (market?.demand_authenticity === "real" && sentiment?.willingness_to_pay_signal === "unlikely") {
    out.push({
      title: "Demand: people want it, but are unlikely to pay",
      sideA: { agent: "Market agent", says: "Demand looks real" },
      sideB: { agent: "Sentiment agent", says: "Willingness to pay is unlikely" },
      howToSettle: "Ask 10 target customers for a paid commitment or a deposit. Interest without payment is not demand.",
    });
  }
  if (market && (market.market_size_signal === "large" || market.growth_trajectory === "growing") && sentiment?.pain_intensity === "low") {
    out.push({
      title: "Demand: big, growing market, but the pain is mild",
      sideA: { agent: "Market agent", says: `Market ${market.market_size_signal}, ${market.growth_trajectory}` },
      sideB: { agent: "Sentiment agent", says: "Pain intensity is low" },
      howToSettle: "A large market of people with a mild problem rarely pays. Find the segment where the pain is acute and test there first.",
    });
  }
  if (market?.growth_trajectory === "growing" && (trend?.timing_signal === "late" || ((trend?.macro_headwinds.length ?? 0) > (trend?.macro_tailwinds.length ?? 0) + 1))) {
    out.push({
      title: "Timing: market is growing, but the window may be closing",
      sideA: { agent: "Market agent", says: "Growing" },
      sideB: { agent: "Trend agent", says: trend?.timing_signal === "late" ? "Timing is late" : "Headwinds outnumber tailwinds" },
      howToSettle: "Check whether growth is going to incumbents. If the leaders are taking it, a new entrant needs a wedge they cannot copy quickly.",
    });
  }
  const confs = [market?.confidence, competitor?.confidence, trend?.confidence, sentiment?.confidence, input.risk?.confidence].filter((c): c is number => typeof c === "number");
  if (confs.length >= 3 && Math.max(...confs) - Math.min(...confs) > 0.4) {
    out.push({
      title: "The agents disagree about how sure they are",
      sideA: { agent: "Most confident agent", says: `${Math.round(Math.max(...confs) * 100)}% sure` },
      sideB: { agent: "Least confident agent", says: `${Math.round(Math.min(...confs) * 100)}% sure` },
      howToSettle: "Treat the low-confidence area as unproven. That is the first place to gather real evidence.",
    });
  }
  return out;
}

// ── Claims ────────────────────────────────────────────────────────────────

const levelOf = (c?: number): "low" | "medium" | "high" => (typeof c !== "number" ? "low" : c >= 0.7 ? "high" : c >= 0.45 ? "medium" : "low");

export function labelClaims(input: EvidenceInput, graded: CompetitorEvidence[]): { claims: EvidenceClaim[]; unknowns: string[] } {
  const claims: EvidenceClaim[] = [];
  const add = (c: EvidenceClaim) => { if (present(c.claim) && claims.length < 14) claims.push({ ...c, claim: clip(c.claim) }); };

  const verified = graded.filter(c => c.quality === "verified");
  if (verified.length > 0) {
    add({ claim: `${verified.length} related product${verified.length === 1 ? "" : "s"} found in live search: ${verified.slice(0, 3).map(v => v.name).join(", ")}`, kind: "evidence", source: `Web search (${input.competitorSource})`, confidence: "high" });
  }

  const p = input.parsed;
  if (present(p?.problem)) add({ claim: `The problem is real: ${p!.problem}`, kind: "hypothesis", source: "Your description. No customer has confirmed it yet.", confidence: "low" });
  if (present(p?.target_customer)) add({ claim: `${p!.target_customer} is the right customer`, kind: "hypothesis", source: "Your description", confidence: "low" });
  if (present(p?.monetization) && !/not specified/i.test(p!.monetization)) add({ claim: `They will pay via: ${p!.monetization}`, kind: "hypothesis", source: "Your description", confidence: "low" });

  for (const s of (input.market?.demand_signals ?? []).slice(0, 2)) add({ claim: s, kind: "inference", source: "Market agent, reasoning from search snippets", confidence: levelOf(input.market?.confidence) });
  for (const s of (input.sentiment?.user_pain_points ?? []).slice(0, 2)) add({ claim: s, kind: "inference", source: "Sentiment agent. No interview data behind it.", confidence: levelOf(input.sentiment?.confidence) });
  for (const s of (input.trend?.macro_tailwinds ?? []).slice(0, 1)) add({ claim: s, kind: "inference", source: "Trend agent", confidence: levelOf(input.trend?.trend_confidence) });
  for (const r of (input.risk?.top_risks ?? []).slice(0, 2)) add({ claim: `${r.title}: ${r.description}`, kind: "inference", source: `Risk agent (${r.severity})`, confidence: levelOf(input.risk?.confidence) });

  if ((input.founderEvidenceCount ?? 0) > 0) {
    add({ claim: `${input.founderEvidenceCount} piece${input.founderEvidenceCount === 1 ? "" : "s"} of your own evidence is on file for this project`, kind: "evidence", source: "Your project's evidence log", confidence: "medium" });
  }

  const unknowns: string[] = [];
  if (input.sentiment?.willingness_to_pay_signal !== "likely") unknowns.push("Whether your target customers will actually pay, and how much");
  unknowns.push("How much it costs to reach and convert a customer");
  unknowns.push("Whether people who try it keep using it");
  if (!(input.founderEvidenceCount && input.founderEvidenceCount > 0)) unknowns.push("What real customers say when asked directly. Nothing here comes from a conversation.");
  for (const u of unknowns.slice(0, 3)) add({ claim: u, kind: "unknown", source: "No data available", confidence: "low" });
  return { claims, unknowns };
}

// ── Confidence band ───────────────────────────────────────────────────────

export function calibrate(input: EvidenceInput, graded: CompetitorEvidence[]): ConfidenceBand {
  const verified = graded.filter(c => c.quality === "verified").length;
  const agentShare = Math.min(1, Math.max(0, input.agentsSucceeded / 5));
  const own = Math.min(1, (input.founderEvidenceCount ?? 0) / 4);
  let quality = 0.2 * agentShare + 0.3 * Math.min(1, verified / 5) + 0.5 * own;
  if (input.analysisIsSynthetic) quality *= 0.5;
  const half = Math.round(7 + (1 - quality) * 22);
  const score = Math.round(input.viabilityScore);
  const low = Math.max(0, score - half);
  const high = Math.min(100, score + half);
  const grade: ConfidenceBand["grade"] = quality >= 0.75 ? "solid" : quality >= 0.5 ? "moderate" : "thin";

  const bits: string[] = [];
  bits.push(verified > 0 ? `${verified} verified source${verified === 1 ? "" : "s"}` : "no verified sources");
  bits.push((input.founderEvidenceCount ?? 0) > 0 ? `${input.founderEvidenceCount} piece${input.founderEvidenceCount === 1 ? "" : "s"} of your own evidence` : "no customer evidence");
  if (input.agentsSucceeded < 5) bits.push(`${input.agentsSucceeded} of 5 agents completed`);
  if (input.analysisIsSynthetic) bits.push("analysis partly synthesised");
  const why = grade === "solid"
    ? `The range is tight because it rests on ${bits.join(", ")}.`
    : `The range is wide because it rests on ${bits.join(", ")}. Real customer evidence is what narrows it.`;
  return { score, low, high, grade, why };
}

// ── Falsification ─────────────────────────────────────────────────────────

export function buildFalsifiers(input: EvidenceInput): Falsifier[] {
  const out: Falsifier[] = [];
  const customer = input.parsed?.target_customer?.trim() || "your target customers";
  const problem = input.parsed?.problem?.trim();

  out.push({
    assumption: problem ? `People have this problem badly enough to act: ${clip(problem, 100)}` : "The problem is painful enough that people act on it",
    test: `Interview 8 of ${customer}. Ask what they did about this the last time it happened. Do not describe your solution.`,
    provenWrongIf: "Fewer than 3 of 8 describe having paid, built a workaround or searched for a fix in the past 3 months.",
  });
  if (input.sentiment?.willingness_to_pay_signal !== "likely") {
    out.push({
      assumption: "They will pay for it",
      test: `Ask 10 of ${customer} for a deposit, pre-order or signed letter of intent at a stated price.`,
      provenWrongIf: "Fewer than 2 of 10 commit money or a dated promise within 14 days.",
    });
  }
  const worst = (input.risk?.top_risks ?? []).find(r => r.severity === "fatal" || r.severity === "high");
  if (worst) {
    out.push({
      assumption: `This risk is manageable: ${clip(worst.title, 80)}`,
      test: worst.mitigation && worst.mitigation.trim() ? clip(worst.mitigation, 160) : "Run the cheapest possible test that would show whether this risk materialises.",
      provenWrongIf: "The cheapest test fails, or you cannot design one that costs less than two weeks of work.",
    });
  }
  if (input.competitor?.saturation_level === "high" || input.competitor?.saturation_level === "medium") {
    out.push({
      assumption: "You can win against existing options",
      test: "Ask 5 users of the closest competitor what they would switch for. Note the exact words.",
      provenWrongIf: "Most say the current tool is good enough, or none can name a thing it fails at.",
    });
  }
  return out.slice(0, 4);
}

// ── Entry point ───────────────────────────────────────────────────────────

export function buildEvidenceLayer(input: EvidenceInput): EvidenceLayer {
  const competitors = gradeCompetitors(input);
  const { claims, unknowns } = labelClaims(input, competitors);
  return {
    claims,
    conflicts: detectConflicts(input, competitors),
    competitors,
    confidence: calibrate(input, competitors),
    falsifiers: buildFalsifiers(input),
    unknowns,
  };
}
