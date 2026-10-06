/**
 * lib/breakEvidenceV3.ts — the parts of the evidence layer that answer a
 * second round of critique:
 *
 *   - evidence about the MARKET is not evidence about THIS product, so demand
 *     is reported twice and the product-specific number is held low until a
 *     customer has been heard from
 *   - a risk score where higher means safer was read as "98% danger", so risk
 *     is reported as exposure plus how uncertain that exposure is
 *   - the advice must follow the diagnosis: when the biggest unknown is
 *     whether the problem exists, the next move is to ask, not to build
 *   - the idea is eight separate bets, so each one is tracked on its own
 *   - an evidence hierarchy that says what kind of proof each claim rests on
 *
 * Deterministic, no model calls. Types come from lib/breakEvidence.ts
 * (type-only import, so there is no runtime cycle).
 */

import type { EvidenceInput, CompetitorEvidence, Falsifier } from "@/lib/breakEvidence";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const present = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const hasCustomerEvidence = (i: EvidenceInput) => (i.founderEvidenceCount ?? 0) > 0;

// ── Market demand vs demand for THIS product ──────────────────────────────

export interface DemandSplit {
  /** What the market signals say, from search and the market agent. */
  market: number;
  /** What can be claimed for this product. Held low until customers were asked. */
  product: number;
  basis: string;
}

export function marketDemandScore(input: EvidenceInput): number {
  const e = input.breakdown?.find((b) => b.key === "demand");
  return clamp(Math.round(e ? e.score : 50), 0, 100);
}

/**
 * Product-specific demand. Without a single customer conversation it cannot rise
 * above 35, and it sits lower still when willingness to pay looks unlikely.
 * Each piece of the founder's own evidence lifts the ceiling, never past the
 * market figure. This is a stated rule, not a measurement.
 */
export function productDemandScore(input: EvidenceInput): number {
  const market = marketDemandScore(input);
  const n = input.founderEvidenceCount ?? 0;
  const wtp = input.sentiment?.willingness_to_pay_signal;
  const ceiling = 35 + n * 8 - (n === 0 && wtp === "unlikely" ? 10 : 0);
  return clamp(Math.min(market, ceiling), 5, 95);
}

export function buildDemandSplit(input: EvidenceInput): DemandSplit | undefined {
  if (!input.breakdown?.some((b) => b.key === "demand")) return undefined;
  const n = input.founderEvidenceCount ?? 0;
  return {
    market: marketDemandScore(input),
    product: productDemandScore(input),
    basis: n === 0
      ? "The market figure comes from search results and an agent's reading of them. The product figure is capped because no customer has been asked about this product, so reports about the wider problem cannot stand in for demand for it."
      : `The product figure is lifted by ${n} piece${n === 1 ? "" : "s"} of your own evidence, and still cannot pass the market figure.`,
  };
}

// ── Risk: exposure and uncertainty, not one number ────────────────────────

export interface RiskExposure {
  exposure: "Low" | "Moderate" | "High" | "Severe";
  uncertainty: "Low" | "Moderate" | "High";
  primaryUnresolved: string;
  note: string;
}

export function buildRiskExposure(input: EvidenceInput, primaryUnresolved: string): RiskExposure | undefined {
  const risks = input.risk?.top_risks ?? [];
  if (!input.risk) return undefined;
  const fatal = risks.filter((r) => r.severity === "fatal").length;
  const high = risks.filter((r) => r.severity === "high").length;
  const medium = risks.filter((r) => r.severity === "medium").length;
  const exposure: RiskExposure["exposure"] =
    fatal > 0 ? "Severe" : high >= 2 ? "High" : high === 1 || medium >= 2 ? "Moderate" : "Low";
  const noCustomer = !hasCustomerEvidence(input);
  const agentConfidence = typeof input.risk.confidence === "number" ? input.risk.confidence : 0.5;
  const uncertainty: RiskExposure["uncertainty"] =
    noCustomer || agentConfidence < 0.45 ? "High" : agentConfidence < 0.7 ? "Moderate" : "Low";
  return {
    exposure,
    uncertainty,
    primaryUnresolved,
    note: "Exposure counts the risks the agent named by severity. Uncertainty says how little has been checked. The 0-100 risk figure in the breakdown is risk resilience, where higher means safer, and is not a danger rating.",
  };
}

// ── What kind of proof stands behind each claim ───────────────────────────

export interface EvidenceLevel {
  level: 1 | 2 | 3 | 4;
  label: string;
  count: number;
  note: string;
}

export interface EvidenceHierarchy {
  levels: EvidenceLevel[];
  statement: string;
}

export function buildEvidenceHierarchy(input: EvidenceInput, graded: CompetitorEvidence[]): EvidenceHierarchy {
  const direct = input.founderEvidenceCount ?? 0;
  const behavioural = graded.filter((c) => c.quality === "verified").length
    + (input.sentiment?.community_signals?.length ?? 0);
  const secondary = input.scraped.length + (input.market?.demand_signals?.length ?? 0);
  const inference = (input.agentsSucceeded ?? 0);
  const levels: EvidenceLevel[] = [
    { level: 1, label: "Direct customer evidence", count: direct, note: "Interviews, payments, usage, retention. Evidence about this product." },
    { level: 2, label: "Market behaviour", count: behavioural, note: "Competitors with real adoption, community activity, spending. Evidence about the space." },
    { level: 3, label: "Secondary sources", count: secondary, note: "Articles, listings, reports. Evidence the topic exists." },
    { level: 4, label: "Model inference", count: inference, note: "An agent's reading of the above. Never counts as proof." },
  ];
  const statement = direct === 0
    ? `Levels 2 and 3 support the existence of the wider problem space. Level 1 evidence that customers want this product is absent, so every demand claim below is about the market, not about you.`
    : `${direct} piece${direct === 1 ? "" : "s"} of direct customer evidence exists. Claims backed only by levels 3 and 4 are still hypotheses.`;
  return { levels, statement };
}

// ── The next move follows the diagnosis ───────────────────────────────────

export interface NextMove {
  /** True when the biggest unknown is demand, so building more is the wrong move. */
  holdBuilding: boolean;
  action: string;
  why: string;
  doNotBuildYet: string[];
}

export function buildNextMove(input: EvidenceInput, falsifiers: Falsifier[]): NextMove {
  const customer = input.parsed?.target_customer?.trim() || "people who have this problem";
  const noCustomer = !hasCustomerEvidence(input);
  const demandOpen = noCustomer || productDemandScore(input) < 55;
  if (demandOpen) {
    return {
      holdBuilding: true,
      action: `Interview 8 of ${customer} this week without describing your product. Ask what they did the last time the problem happened, what it cost them, and what they use now. Write down their exact words.`,
      why: "The biggest unknown is whether the problem is painful and frequent enough to act on. Eight conversations settle more of that than any build, pilot or campaign, at the lowest cost.",
      doNotBuildYet: [
        "A pilot with dozens of people. It tests your solution before you know the problem is real.",
        "A multi-week feature roadmap. It spends the time the interviews would have saved.",
        "Paid ads or a launch. They measure curiosity, not need.",
      ],
    };
  }
  const first = falsifiers[0];
  return {
    holdBuilding: false,
    action: first ? first.test : `Run the cheapest test that could prove your riskiest assumption wrong.`,
    why: "Demand has some direct support. The next most informative step is the test most likely to prove the thesis wrong.",
    doNotBuildYet: [],
  };
}

// ── Hypothesis graph ──────────────────────────────────────────────────────

export type HypothesisKind =
  | "customer" | "problem" | "frequency" | "willingness_to_pay"
  | "solution" | "differentiation" | "distribution" | "economics";

export interface Hypothesis {
  id: HypothesisKind;
  label: string;
  statement: string;
  status: "untested" | "indirect_support" | "contested" | "supported";
  evidence: string[];
  counterevidence: string[];
  unknowns: string[];
  /** 0-1. Held low without customer evidence no matter how much indirect support exists. */
  confidence: number;
  falsifier: string;
  nextExperiment: string;
}

const COMPONENT_FOR: Partial<Record<HypothesisKind, string>> = {
  problem: "demand", frequency: "demand", willingness_to_pay: "monetization",
  differentiation: "uniqueness", economics: "monetization",
};

export function buildHypotheses(input: EvidenceInput, falsifiers: Falsifier[]): Hypothesis[] {
  const customer = input.parsed?.target_customer?.trim() || "the customer you have in mind";
  const problem = input.parsed?.problem?.trim() || "the problem you describe";
  const noCustomer = !hasCustomerEvidence(input);
  const ceiling = noCustomer ? 0.35 : 0.9;
  const sent = input.sentiment;
  const mk = input.market;
  const comp = input.competitor;
  const falsifierFor = (id: HypothesisKind, fallback: string) => {
    const c = COMPONENT_FOR[id];
    const f = c ? falsifiers.find((x) => x.component === c) : undefined;
    return f ? f.provenWrongIf : fallback;
  };
  const conf = (indirect: number, counter: number) => clamp(0.15 + indirect * 0.06 - counter * 0.08, 0.05, ceiling);
  const status = (indirect: number, counter: number): Hypothesis["status"] =>
    !noCustomer && indirect > counter ? "supported" : counter > 0 && indirect > 0 ? "contested" : indirect > 0 ? "indirect_support" : "untested";

  const painSignals = [...(sent?.user_pain_points ?? []), ...(mk?.demand_signals ?? [])].filter(present).slice(0, 3);
  const painCounter: string[] = [];
  if (sent?.pain_intensity === "low") painCounter.push("The sentiment agent read the pain as mild.");
  if ((mk?.demand_gaps ?? []).length) painCounter.push(...(mk!.demand_gaps as string[]).filter(present).slice(0, 2));

  const wtpEvidence: string[] = [];
  const wtpCounter: string[] = [];
  if (sent?.willingness_to_pay_signal === "likely") wtpEvidence.push("The sentiment agent saw signs people pay for similar things.");
  if (sent?.willingness_to_pay_signal === "possible") wtpEvidence.push("Some signs people pay for similar things.");
  if (sent?.willingness_to_pay_signal === "unlikely") wtpCounter.push("The sentiment agent saw little sign people pay.");

  const diff = comp?.differentiation_opportunities?.find(present);
  const diffEvidence = diff ? [`An agent proposed: ${clip(diff, 110)}`] : [];
  const diffCounter: string[] = [];
  if (comp?.saturation_level === "high") diffCounter.push("The space is crowded.");
  if (typeof comp?.competitive_moat_score === "number" && comp.competitive_moat_score <= 3) diffCounter.push("The agent rated the space as easy to copy.");

  const verified = comp ? (comp.direct_competitors?.length ?? 0) : 0;

  const list: Hypothesis[] = [
    {
      id: "customer", label: "Customer", statement: `${customer} are the right people to build for.`,
      status: status(input.parsed?.target_customer ? 1 : 0, 0), evidence: input.parsed?.target_customer ? [`You named them: ${clip(customer, 90)}`] : [],
      counterevidence: [], unknowns: ["Whether they are reachable and share the same problem."],
      confidence: conf(input.parsed?.target_customer ? 1 : 0, 0),
      falsifier: "Interviews show the pain sits with a different kind of person.",
      nextExperiment: `Ask 8 of ${customer} to describe their last bad week. See who the pain actually belongs to.`,
    },
    {
      id: "problem", label: "Problem", statement: `${clip(problem, 120)} is a real problem.`,
      status: status(painSignals.length, painCounter.length), evidence: painSignals, counterevidence: painCounter,
      unknowns: ["Whether the pain found online is the one your product addresses."],
      confidence: conf(painSignals.length, painCounter.length),
      falsifier: falsifierFor("problem", "Fewer than 3 of 8 describe paying, building a workaround or searching for a fix."),
      nextExperiment: "Interview 8 without describing your solution.",
    },
    {
      id: "frequency", label: "Frequency", statement: "The problem happens often enough that people act on it.",
      status: noCustomer ? "untested" : "indirect_support", evidence: [], counterevidence: [],
      unknowns: ["How often it happens.", "What it costs each time."],
      confidence: noCustomer ? 0.1 : 0.4,
      falsifier: "Most interviewees say it happens less than once a month.",
      nextExperiment: "In the same interviews ask when it last happened and what they did.",
    },
    {
      id: "willingness_to_pay", label: "Willingness to pay", statement: "They will pay enough, soon enough, to run a business.",
      status: status(wtpEvidence.length, wtpCounter.length), evidence: wtpEvidence, counterevidence: wtpCounter,
      unknowns: ["The price they would accept.", "Who holds the budget."],
      confidence: conf(wtpEvidence.length, wtpCounter.length),
      falsifier: falsifierFor("willingness_to_pay", "Fewer than 2 of 10 commit money or a dated promise within 14 days."),
      nextExperiment: "Ask 10 for a deposit or signed letter of intent at a stated price.",
    },
    {
      id: "solution", label: "Solution", statement: "Your proposed mechanism fixes the problem.",
      status: "untested", evidence: [], counterevidence: [],
      unknowns: ["Whether the mechanism changes behaviour or only describes it."],
      confidence: 0.1,
      falsifier: "People given the mechanism do not change what they do.",
      nextExperiment: "Hand-deliver the mechanism to 5 people for a week before building any of it.",
    },
    {
      id: "differentiation", label: "Differentiation", statement: "Existing options do not already solve this well enough.",
      status: status(diffEvidence.length, diffCounter.length), evidence: diffEvidence, counterevidence: diffCounter,
      unknowns: ["Why users of the closest alternative stay with it."],
      confidence: conf(diffEvidence.length + (verified > 0 ? 1 : 0), diffCounter.length),
      falsifier: falsifierFor("differentiation", "Most users of the closest competitor call it good enough."),
      nextExperiment: "Ask 5 users of the closest competitor what they would switch for.",
    },
    {
      id: "distribution", label: "Distribution", statement: "You can reach these customers at a cost that works.",
      status: "untested", evidence: [], counterevidence: [],
      unknowns: ["Where they gather.", "What a first customer costs to reach."],
      confidence: 0.1,
      falsifier: "Ten direct outreach attempts produce no replies.",
      nextExperiment: "Reach the first 20 interviewees by the channel you hope to scale and record the reply rate.",
    },
    {
      id: "economics", label: "Economics", statement: `The ${input.parsed?.monetization?.trim() || "pricing"} model leaves margin after the cost of serving and reaching a customer.`,
      status: "untested", evidence: [], counterevidence: [],
      unknowns: ["Cost to serve.", "Cost to acquire.", "Churn."],
      confidence: 0.1,
      falsifier: "Cost to serve plus cost to reach exceeds what the customer says they will pay.",
      nextExperiment: "Work the numbers on paper with the price from the willingness-to-pay test.",
    },
  ];
  return list;
}

// ── Competitor hygiene ────────────────────────────────────────────────────

const DIRECTORY_HOSTS = /(producthunt|g2\.com|capterra|alternativeto|getapp|softwareadvice|trustradius|crunchbase|reddit|medium|quora|wikipedia|youtube|linkedin)\./i;
const LISTICLE = /\b(best|top \d+|alternatives?|vs\.?|review|roundup|directory|list of|resources?)\b/i;
const CATEGORY_LABEL = /\((generic|category|various)[^)]*\)|^generic\b/i;

function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]+/g, ""); }

/** Why an entry is not a competitor, or null if it can stay. */
export function notACompetitorReason(name: string, url: string | undefined, productName?: string): string | null {
  if (productName && norm(productName).length > 2 && norm(name).includes(norm(productName))) return "This is your own product.";
  if (CATEGORY_LABEL.test(name)) return "A category, not a product.";
  let host = "";
  try { host = url ? new URL(url).hostname : ""; } catch { host = ""; }
  if (host && DIRECTORY_HOSTS.test(`${host}.`)) return "A directory or discussion page, not a product.";
  if (LISTICLE.test(name) && !url) return "A list or resource page, not a product.";
  if (LISTICLE.test(name) && host && DIRECTORY_HOSTS.test(`${host}.`)) return "A list or resource page, not a product.";
  return null;
}
