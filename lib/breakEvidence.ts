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

import { tokenize, stem } from "@/lib/taxonomy/taskTaxonomy";
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

export type TestComponent = "demand" | "monetization" | "competition" | "uniqueness" | "risk";

export interface Falsifier {
  assumption: string;
  test: string;
  provenWrongIf: string;
  /** Stable id within one analysis, so a result can be recorded against it later. */
  id?: string;
  component?: TestComponent;
  /** How likely this analysis said the assumption is to hold (0-1). This is the prediction the track record scores. */
  predictedHold?: number;
}

export interface ConfidenceBand {
  score: number;
  low: number;
  high: number;
  grade: "thin" | "moderate" | "solid";
  why: string;
}

export interface ScoreComponent {
  key: string;
  label: string;
  score: number;
  weight: string;
  basedOn: string;
  kind: "evidence" | "mixed" | "inference";
}

/** Where the headline number comes from, and how far it can be trusted. */
export interface ScoreBasis {
  label: string;
  components: ScoreComponent[];
  inferenceSharePct: number;
  calibrated: false;
  note: string;
}

export interface ConclusionConfidence {
  pct: number;
  label: "Low" | "Moderate" | "High";
  primaryUncertainty: string;
  secondaryUncertainty: string;
  requiredEvidence: string[];
}

/** The experiment that tests the differentiating claim, not the easy adjacent one. */
export interface ThesisTest {
  id?: string;
  predictedHold?: number;
  thesis: string;
  notThisTest: string;
  setup: string;
  measure: string[];
  why: string;
  basedOn: string;
  expectedLearning: string;
  ifItFails: string;
}

export interface ChangeMyMind { kills: string[]; strengthens: string[] }

export interface PivotCheck {
  title: string;
  relation: "same_problem" | "adjacent" | "different_problem";
  reason: string;
  validatesOriginal: boolean;
}

export interface EvidenceLayer {
  claims: EvidenceClaim[];
  conflicts: EvidenceConflict[];
  competitors: CompetitorEvidence[];
  confidence: ConfidenceBand;
  falsifiers: Falsifier[];
  unknowns: string[];
  // Added later; optional so results saved before this existed still render.
  scoreBasis?: ScoreBasis;
  conclusion?: ConclusionConfidence;
  thesisTest?: ThesisTest;
  changeMyMind?: ChangeMyMind;
  pivotChecks?: PivotCheck[];
  /** How reliable this founder's past analyses turned out to be (see lib/breakCalibration.ts). */
  trackRecord?: import("@/lib/breakCalibration").TrackRecord;
  /** Id of the saved prediction row, set by the route so results can be recorded. */
  predictionId?: string;
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
  /** Per-dimension scores with weights, from computeViabilityBreakdown(). */
  breakdown?: Array<{ key: string; label: string; score: number; weight: string }>;
  pivots?: Array<{ title: string; description?: string; target_niche?: string; why_better?: string; key_change?: string }>;
}

const clampP = (n: number) => Math.min(0.95, Math.max(0.05, n));
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
  out.push(...detectTextConflicts(input));
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

// ── Contradictions in what the agents WROTE ───────────────────────────────
// The rating-based checks above miss the case where one agent writes "clear
// evidence of user frustration with X" and another writes "no evidence of
// users complaining about X". Both can be true at different scopes (a broad
// frustration vs the specific pain the idea depends on), but the report must
// say so instead of printing both.

const AFFIRM_RE = /\b(clear|strong|significant|widespread|substantial|evident|numerous|ample|abundant)\b[^.]{0,50}\b(evidence|demand|frustrations?|complaints?|interest|need|pain|signals?)\b|\b(users|people|customers)\s+(are\s+|have been\s+)?(frustrated|complaining|struggling|asking)\b/i;
const DENY_RE = /\b(no|little|limited|insufficient|lack of|lacks|absence of|not enough|zero|without any)\b[^.]{0,40}\b(evidence|data|signals?|complaints?|indication|proof|sign)\b|\bno\s+(users|one|people)\b[^.]{0,40}\b(complain|report|mention)/i;
const GENERIC_STEMS = new Set(["evidence", "data", "suppli", "user", "peopl", "clear", "there", "across", "signal", "strong", "market", "customer", "avail", "provid", "indic", "exist", "actively", "specific", "thei", "have", "that", "with", "from", "about", "their", "this", "which", "when", "than", "more", "most", "some", "such", "into", "also", "being", "been", "could", "would", "should"]);

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map(t => t.trim()).filter(t => t.length > 25);
}
function contentStems(text: string): Set<string> {
  return new Set(tokenize(text).filter(t => t.length > 3).map(stem).filter(t => !GENERIC_STEMS.has(t)));
}

export function detectTextConflicts(input: EvidenceInput): EvidenceConflict[] {
  const { market, sentiment, trend, competitor, risk } = input;
  const sources: Array<{ agent: string; texts: string[] }> = [
    { agent: "Market agent", texts: [...(market?.demand_signals ?? []), market?.target_customer_fit ?? "", market?.reasoning ?? ""] },
    { agent: "Sentiment agent", texts: [...(sentiment?.user_pain_points ?? []), ...(sentiment?.demand_signals ?? []), ...(sentiment?.community_signals ?? []), sentiment?.reasoning ?? ""] },
    { agent: "Trend agent", texts: [trend?.reasoning ?? ""] },
    { agent: "Competitor agent", texts: [competitor?.reasoning ?? ""] },
    { agent: "Risk agent", texts: [risk?.reasoning ?? ""] },
  ];
  const tagged = sources.flatMap(src =>
    src.texts.flatMap(t => sentences(t)).map(sent => ({
      agent: src.agent, sent,
      kind: DENY_RE.test(sent) ? "deny" as const : AFFIRM_RE.test(sent) ? "affirm" as const : null,
      stems: contentStems(sent),
    })).filter(x => x.kind),
  );
  const out: EvidenceConflict[] = [];
  const used = new Set<string>();
  for (const a of tagged.filter(t => t.kind === "affirm")) {
    for (const d of tagged.filter(t => t.kind === "deny")) {
      if (a.agent === d.agent) continue;
      const shared = [...a.stems].filter(x => d.stems.has(x));
      if (shared.length < 1) continue;
      const aUser = /\b(user|users|people|customers?)\b/i.test(a.sent), dUser = /\b(user|users|people|customers?)\b/i.test(d.sent);
      if (shared.length < 2 && !(aUser && dUser)) continue;
      const key = [a.agent, d.agent].sort().join("|");
      if (used.has(key)) continue;
      used.add(key);
      out.push({
        title: "Evidence conflict: one section reports evidence, another reports none",
        sideA: { agent: a.agent, says: clip(a.sent, 170) },
        sideB: { agent: d.agent, says: clip(d.sent, 170) },
        howToSettle: "These may describe different scopes: a broad frustration is not proof of the specific pain this idea needs. Treat the specific claim as unvalidated until target customers describe it unprompted, then decide which section was talking about what.",
      });
      if (out.length >= 2) return out;
    }
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

export function evidenceQuality(input: EvidenceInput, graded: CompetitorEvidence[]): number {
  const verified = graded.filter(c => c.quality === "verified").length;
  const agentShare = Math.min(1, Math.max(0, input.agentsSucceeded / 5));
  const own = Math.min(1, (input.founderEvidenceCount ?? 0) / 4);
  let quality = 0.2 * agentShare + 0.3 * Math.min(1, verified / 5) + 0.5 * own;
  if (input.analysisIsSynthetic) quality *= 0.5;
  return quality;
}

export function calibrate(input: EvidenceInput, graded: CompetitorEvidence[]): ConfidenceBand {
  const verified = graded.filter(c => c.quality === "verified").length;
  const quality = evidenceQuality(input, graded);
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
  const scoreOf = (key: string, fallback = 0.4): number => {
    const e = input.breakdown?.find(x => x.key === key);
    return clampP(e ? e.score / 100 : fallback);
  };
  const riskHold = (sev?: string) => clampP(sev === "fatal" ? 0.15 : sev === "high" ? 0.3 : sev === "medium" ? 0.6 : 0.85);
  const customer = input.parsed?.target_customer?.trim() || "your target customers";
  const problem = input.parsed?.problem?.trim();

  out.push({
    assumption: problem ? `People have this problem badly enough to act: ${clip(problem, 100)}` : "The problem is painful enough that people act on it",
    test: `Interview 8 of ${customer}. Ask what they did about this the last time it happened. Do not describe your solution.`,
    provenWrongIf: "Fewer than 3 of 8 describe having paid, built a workaround or searched for a fix in the past 3 months.",
    component: "demand", predictedHold: scoreOf("demand"),
  });
  if (input.sentiment?.willingness_to_pay_signal !== "likely") {
    out.push({
      assumption: "They will pay for it",
      test: `Ask 10 of ${customer} for a deposit, pre-order or signed letter of intent at a stated price.`,
      provenWrongIf: "Fewer than 2 of 10 commit money or a dated promise within 14 days.",
      component: "monetization", predictedHold: scoreOf("monetization"),
    });
  }
  const worst = (input.risk?.top_risks ?? []).find(r => r.severity === "fatal" || r.severity === "high");
  if (worst) {
    out.push({
      assumption: `This risk is manageable: ${clip(worst.title, 80)}`,
      test: worst.mitigation && worst.mitigation.trim() ? clip(worst.mitigation, 160) : "Run the cheapest possible test that would show whether this risk materialises.",
      provenWrongIf: "The cheapest test fails, or you cannot design one that costs less than two weeks of work.",
      component: "risk", predictedHold: riskHold(worst.severity),
    });
  }
  if (input.competitor?.saturation_level === "high" || input.competitor?.saturation_level === "medium") {
    out.push({
      assumption: "You can win against existing options",
      test: "Ask 5 users of the closest competitor what they would switch for. Note the exact words.",
      provenWrongIf: "Most say the current tool is good enough, or none can name a thing it fails at.",
      component: "competition", predictedHold: scoreOf("competition"),
    });
  }
  return out.slice(0, 4).map((f, i) => ({ ...f, id: `f${i + 1}` }));
}

// ── Where the score comes from ────────────────────────────────────────────

export function buildScoreBasis(input: EvidenceInput, graded: CompetitorEvidence[]): ScoreBasis | undefined {
  if (!input.breakdown || input.breakdown.length === 0) return undefined;
  const verified = graded.filter(c => c.quality === "verified").length;
  const inferred = graded.filter(c => c.quality === "inferred").length;
  const own = (input.founderEvidenceCount ?? 0) > 0;
  const basis = (key: string): { basedOn: string; kind: ScoreComponent["kind"] } => {
    switch (key) {
      case "demand": return own
        ? { basedOn: "Market and Sentiment agents reading search snippets, plus your own project evidence", kind: "mixed" }
        : { basedOn: "Market and Sentiment agents reading search snippets. No customer was asked.", kind: "inference" };
      case "competition": return verified > 0
        ? { basedOn: `${verified} competitor${verified === 1 ? "" : "s"} found in live search, ${inferred} named by the agent only`, kind: "mixed" }
        : { basedOn: "Competitor agent's own list. Nothing matched in live search.", kind: "inference" };
      case "timing": return { basedOn: "Trend agent's reading of search results. No hard market data.", kind: "inference" };
      case "uniqueness": return { basedOn: "Competitor agent's view of your differentiation. No customer has compared you with an alternative.", kind: "inference" };
      case "monetization": return own
        ? { basedOn: "Sentiment agent's willingness-to-pay signal, plus your own project evidence", kind: "mixed" }
        : { basedOn: "Sentiment agent's willingness-to-pay signal. Nobody was asked to pay.", kind: "inference" };
      default: return { basedOn: "Agent judgement", kind: "inference" };
    }
  };
  const components: ScoreComponent[] = input.breakdown.map(b => ({ key: b.key, label: b.label, score: Math.round(b.score), weight: b.weight, ...basis(b.key) }));
  const total = components.reduce((n, c) => n + (parseFloat(c.weight) || 0), 0) || 100;
  const inf = components.filter(c => c.kind === "inference").reduce((n, c) => n + (parseFloat(c.weight) || 0), 0);
  return {
    label: "Model-generated estimate",
    components,
    inferenceSharePct: Math.round((inf / total) * 100),
    calibrated: false,
    note: "The weights are fixed by BuildMind and shown above. Each part is a model's judgement, and the result has not been calibrated against how real startups turned out. Read it as a diagnostic that tells you where to look, not a measurement of viability.",
  };
}

// ── Conclusion confidence ─────────────────────────────────────────────────

export function buildConclusion(input: EvidenceInput, graded: CompetitorEvidence[], falsifiers: Falsifier[], conflicts: EvidenceConflict[]): ConclusionConfidence {
  const q = evidenceQuality(input, graded);
  const noCustomer = !(input.founderEvidenceCount && input.founderEvidenceCount > 0);
  // Without a single customer conversation, web research alone cannot justify more than middling confidence.
  const pct = Math.min(noCustomer ? 55 : 95, Math.round(15 + q * 75));
  const worst = (input.risk?.top_risks ?? []).find(r => r.severity === "fatal" || r.severity === "high");
  const customer = input.parsed?.target_customer?.trim() || "your target customers";

  const primary = conflicts.length > 0 && /evidence/i.test(conflicts[0].title)
    ? "Whether the specific pain this idea depends on exists, or only a broader frustration does"
    : noCustomer ? `Whether ${customer} hit this problem often enough to act on it`
    : input.sentiment?.willingness_to_pay_signal !== "likely" ? "Whether they will pay, and how much"
    : "Whether the strongest risk can be overcome";
  const secondary = worst ? `Whether this can be overcome: ${clip(worst.title, 90)}`
    : input.competitor?.saturation_level === "high" || input.competitor?.saturation_level === "medium" ? "Whether you can beat what people already use"
    : "How much it costs to reach and keep a customer";

  return {
    pct,
    label: pct >= 65 ? "High" : pct >= 40 ? "Moderate" : "Low",
    primaryUncertainty: primary,
    secondaryUncertainty: secondary,
    requiredEvidence: falsifiers.slice(0, 3).map(f => f.test.split(/(?<=\.)\s/)[0]),
  };
}

// ── The experiment that tests the actual thesis ───────────────────────────

export function buildThesisTest(input: EvidenceInput, graded: CompetitorEvidence[]): ThesisTest | undefined {
  const diff = input.competitor?.differentiation_opportunities?.find(present)
    ?? input.competitor?.market_gaps?.find(present);
  if (!diff) return undefined;
  const rivals = graded.filter(c => c.quality !== "adjacent").slice(0, 3).map(c => c.name);
  const customer = input.parsed?.target_customer?.trim() || "target customers";
  const rivalText = rivals.length ? rivals.join(", ") : "the tools people use today";
  const uniq = input.breakdown?.find(x => x.key === "uniqueness");
  return {
    id: "thesis",
    predictedHold: clampP(uniq ? uniq.score / 100 : 0.3),
    thesis: clip(diff, 200),
    notThisTest: `Do not test the part ${rivalText} already do well. Passing that proves nothing about your idea and quietly turns you into a copy of them.`,
    setup: `Build a realistic set of 10 or more cases where ONLY your differentiator can succeed: ${clip(diff, 120)}. Include traps (near-duplicates, old versions, partial information). Run it with 5 to 8 ${customer}, phrasing each case the way a real customer states the need, with no hints.`,
    measure: [
      "Success rate on those cases, next to the best existing option on the same cases",
      "Wrong answers (false positives) and how confidently they were stated",
      "Effort and time to reach the right answer",
      "Whether it can explain why it believes the answer is correct",
      "Whether each participant says they would have solved it without you",
    ],
    why: "The idea only matters if it solves cases existing tools fail on. A test the easy version could pass cannot tell you that.",
    basedOn: `The differentiation the competitor analysis identified, set against ${rivalText}.`,
    expectedLearning: "A real success rate on the hard cases, and how often customers meet such cases at all.",
    ifItFails: "If existing options solve the hard cases about as well, the differentiator is not a business yet. Either find a case type they cannot solve, or stop here with the lesson.",
  };
}

export function buildChangeMyMind(input: EvidenceInput, falsifiers: Falsifier[], thesis?: ThesisTest): ChangeMyMind {
  const kills = falsifiers.map(f => f.provenWrongIf);
  const strengthens = [
    "Customers repeatedly describe the problem unprompted, with a specific recent example",
    "At least a few commit money or a dated promise within 14 days",
  ];
  if (thesis) {
    kills.push("Existing tools solve the hard test cases about as well as yours does");
    strengthens.unshift("Your approach solves the hard cases that the best existing option fails on");
  }
  kills.push("Customers will not give the access or data your approach needs");
  strengthens.push("Results improve as you add context, without adding manual work per customer");
  return { kills: kills.slice(0, 5), strengthens: strengthens.slice(0, 5) };
}

// ── Do the pivots test the original idea? ─────────────────────────────────

export function checkPivots(input: EvidenceInput): PivotCheck[] {
  const origin = contentStems(`${input.parsed?.problem ?? ""} ${input.parsed?.target_customer ?? ""}`);
  return (input.pivots ?? []).map(p => {
    const text = contentStems(`${p.title} ${p.description ?? ""} ${p.target_niche ?? ""} ${p.key_change ?? ""}`);
    const shared = [...text].filter(x => origin.has(x)).length;
    const overlap = origin.size ? shared / Math.min(origin.size, Math.max(text.size, 1)) : 0;
    const relation: PivotCheck["relation"] = overlap >= 0.3 ? "same_problem" : overlap >= 0.12 ? "adjacent" : "different_problem";
    const reason = relation === "same_problem"
      ? "Narrows who you serve or how you charge. The core problem is the same, so evidence about it still counts."
      : relation === "adjacent"
        ? "Solves a nearby problem. Only part of your evidence carries over, so check this customer really has it."
        : "Solves a different problem for a different buyer. It can be a business, but it does not validate your original idea. Treat it as a separate bet.";
    return { title: p.title, relation, reason, validatesOriginal: relation === "same_problem" };
  });
}

// ── Entry point ───────────────────────────────────────────────────────────

export function buildEvidenceLayer(input: EvidenceInput): EvidenceLayer {
  const competitors = gradeCompetitors(input);
  const { claims, unknowns } = labelClaims(input, competitors);
  const conflicts = detectConflicts(input, competitors);
  const falsifiers = buildFalsifiers(input);
  const thesisTest = buildThesisTest(input, competitors);
  return {
    claims,
    conflicts,
    competitors,
    confidence: calibrate(input, competitors),
    falsifiers,
    unknowns,
    scoreBasis: buildScoreBasis(input, competitors),
    conclusion: buildConclusion(input, competitors, falsifiers, conflicts),
    thesisTest,
    changeMyMind: buildChangeMyMind(input, falsifiers, thesisTest),
    pivotChecks: checkPivots(input),
  };
                                       }
