/**
 * lib/evidence.ts — evidence discipline for agent findings.
 *
 * Separates three things the UI used to blur together:
 *   signal         interesting, but thin (one source, or reasoning only)
 *   supported      two or more independent sources agree
 *   decision_grade supported + counter-evidence was looked for + strong confidence
 *
 * "Score" (which way the evidence points) and "evidence strength" (how well it
 * is supported) are reported separately. Pure functions, unit tested.
 */

export type EvidenceTier = "signal" | "supported" | "decision_grade";
export type Readiness = "explore" | "test" | "decide";

export interface EvidenceInput {
  signal_type: string;
  positive: boolean;
  confidence: number;
  evidence: string;
  source_type?: string | null;
  sources?: string[] | null;
  counter_evidence?: string | null;
}

export interface Classified {
  tier: EvidenceTier;
  sourceCount: number;
  caveat: string | null;
}

const ABSENCE = new Set(["demand_absent", "timing_bad", "abandon_signal"]);

export function domainOf(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Distinct source domains, from the listed sources plus any URLs quoted in the evidence text. */
export function extractSources(evidence: string, listed?: string[] | null): string[] {
  const urls = [...(listed ?? []), ...(evidence.match(/https?:\/\/[^\s)\]>"']+/gi) ?? [])];
  const set = new Set<string>();
  for (const u of urls) {
    const d = domainOf(u);
    if (d) set.add(d);
  }
  return [...set];
}

export function classifyFinding(f: EvidenceInput): Classified {
  const sourceCount = extractSources(f.evidence ?? "", f.sources).length;
  const reasoningOnly = f.source_type !== "web_search" || sourceCount === 0;
  const isAbsence = ABSENCE.has(f.signal_type);
  const needed = isAbsence ? 3 : 2;
  const caveats: string[] = [];

  if (isAbsence) caveats.push("Absence of evidence in search is not evidence of absence. People may use different words or find solutions elsewhere.");
  if (f.signal_type === "pivot_candidate") caveats.push("An opportunity to test, not a recommendation to pivot.");

  if (reasoningOnly) {
    caveats.unshift("Reasoned from patterns, with no external source.");
    return { tier: "signal", sourceCount, caveat: caveats.join(" ") };
  }
  if (sourceCount < needed) {
    caveats.unshift(sourceCount <= 1 ? "Rests on a single source." : `Needs ${needed} independent sources for this kind of claim; found ${sourceCount}.`);
    return { tier: "signal", sourceCount, caveat: caveats.join(" ") };
  }
  const counter = (f.counter_evidence ?? "").trim().length > 10;
  const strong = f.confidence >= 0.65 && counter && f.signal_type !== "pivot_candidate";
  return { tier: strong ? "decision_grade" : "supported", sourceCount, caveat: caveats.length ? caveats.join(" ") : null };
}

export const TIER_LABEL: Record<EvidenceTier, string> = {
  signal: "Signal",
  supported: "Supported",
  decision_grade: "Decision-grade",
};

export const TIER_MEANING: Record<EvidenceTier, string> = {
  signal: "Interesting, but thin. Treat as a hypothesis to test.",
  supported: "Two or more independent sources agree.",
  decision_grade: "Multiple sources, counter-evidence considered, strong confidence.",
};

/** How well supported the whole run is, 0–100. Independent of which way it points. */
export function evidenceStrength(findings: EvidenceInput[]): number {
  if (!findings.length) return 0;
  const pts = { signal: 0.2, supported: 0.65, decision_grade: 1 } as const;
  const total = findings.reduce((s, f) => s + pts[classifyFinding(f).tier], 0);
  return Math.round((total / findings.length) * 100);
}

export interface RunReadiness { level: Readiness; reason: string; counts: Record<EvidenceTier, number> }

export function runReadiness(findings: EvidenceInput[]): RunReadiness {
  const counts: Record<EvidenceTier, number> = { signal: 0, supported: 0, decision_grade: 0 };
  const grade = findings.map((f) => ({ f, t: classifyFinding(f).tier }));
  for (const g of grade) counts[g.t] += 1;
  const dg = grade.filter((g) => g.t === "decision_grade");
  const pos = dg.filter((g) => g.f.positive).length;
  const neg = dg.length - pos;
  if (dg.length >= 2 && (pos === 0 || neg === 0)) {
    return { level: "decide", reason: `${dg.length} decision-grade findings point the same way.`, counts };
  }
  if (dg.length >= 1 && pos > 0 && neg > 0) {
    return { level: "test", reason: "Decision-grade findings disagree with each other. Resolve that before acting.", counts };
  }
  if (counts.supported + counts.decision_grade >= 1) {
    return { level: "test", reason: "Some findings are supported, but not enough to decide. Run a cheap test.", counts };
  }
  return { level: "explore", reason: "Everything here is a signal from thin evidence. Use it to decide what to check next.", counts };
}

export interface FramedVerdict { label: string; note: string; strong: boolean }

/** A pivot or kill verdict is only presented as a decision when the evidence can carry it. */
export function frameVerdict(verdict: string, r: RunReadiness): FramedVerdict {
  const strong = r.level === "decide";
  switch (verdict) {
    case "pivot":
      return strong
        ? { label: "Pivot recommended", note: r.reason, strong }
        : { label: "Pivot worth testing", note: `Not yet a pivot decision. ${r.reason}`, strong };
    case "kill":
      return strong
        ? { label: "Stop recommended", note: r.reason, strong }
        : { label: "Stop signal, unconfirmed", note: `Do not abandon on this alone. ${r.reason}`, strong };
    case "proceed":
      return strong
        ? { label: "Proceed", note: r.reason, strong }
        : { label: "Promising, unproven", note: r.reason, strong };
    default:
      return { label: "Inconclusive", note: r.reason, strong };
  }
}

/** Plain-language explanation of what the two numbers mean. */
export function scoreExplainer(): string {
  return "Direction shows which way the evidence points. Evidence strength shows how well supported it is. A high direction with low strength is a hunch, not a result.";
}

export type VerificationStatus = "unverified_hypothesis" | "founder_verified" | "rejected";

export interface Provenance {
  verification_status: VerificationStatus;
  evidence_tier: EvidenceTier;
  source_count: number;
  confirmed_at: string;
  confirm_note: string | null;
}

/**
 * What confirming a finding actually records. A signal confirmed without the
 * founder saying they checked it stays an unverified hypothesis.
 */
export function buildProvenance(tier: EvidenceTier, sourceCount: number, verifiedByFounder: boolean, note?: string | null, now = new Date()): Provenance {
  const verified = verifiedByFounder || tier === "decision_grade";
  return {
    verification_status: verified ? "founder_verified" : "unverified_hypothesis",
    evidence_tier: tier,
    source_count: sourceCount,
    confirmed_at: now.toISOString(),
    confirm_note: note?.trim() ? note.trim().slice(0, 500) : null,
  };
}
