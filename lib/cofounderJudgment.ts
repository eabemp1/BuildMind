/**
 * Deterministic decision-quality layer over Founder Intelligence.
 * It makes the system's disagreement, uncertainty, opportunity cost, and
 * intervention level explicit before an LLM turns them into conversation.
 */
import type { FounderIntelligenceState, IntelligenceSignal } from "@/lib/founderIntelligence";

export type InterventionMode = "none" | "passive_insight" | "suggestion" | "challenge" | "action" | "escalation";
export type ProposalDecision = "agree" | "agree_with_modification" | "defer" | "reject" | "investigate";

export interface NegativeRecommendation {
  type: "stop" | "pause" | "defer" | "avoid" | "reduce" | "do_not_optimize_yet" | "validate_before_building";
  statement: string;
  reason: string;
  evidence: string[];
  confidence: number;
}

export interface EvidenceBackedJudgment {
  observation: string;
  interpretation: string;
  evidence: string[];
  confidence: number;
  implication: string;
  recommended_action: string;
  uncertainty: string;
  smallest_evidence_to_resolve: string;
}

export interface InterventionState {
  should_intervene: boolean;
  mode: InterventionMode;
  intensity: number;
  reason: string;
  evidence: string[];
  founder_awareness: "unknown" | "likely_aware" | "likely_unaware";
}

export interface ProposalEvaluation {
  decision: ProposalDecision;
  problem_solved: string;
  current_bottleneck: string;
  supporting_evidence: string[];
  contradicting_evidence: string[];
  opportunity_cost: string;
  alternatives: string[];
  higher_leverage_action: string | null;
  confidence: number;
  rationale: string;
}

export interface CofounderJudgment {
  what_matters_now: string;
  largest_constraint: string;
  neglected_area: string | null;
  opportunity_cost: string;
  highest_leverage_action: string | null;
  should_not_do: NegativeRecommendation[];
  reasoning: EvidenceBackedJudgment[];
  intervention: InterventionState;
  uncertainty: { known: string[]; inferred: string[]; unknown: string[] };
}

const severityValue = { low: 1, medium: 2, high: 3, critical: 4 } as const;

function signalEvidence(signal: IntelligenceSignal): string[] {
  return signal.evidence.map((item) => `${item.source}: ${item.detail}`).slice(0, 3);
}

function highestSignal(state: FounderIntelligenceState): IntelligenceSignal | null {
  return state.signals.slice().sort((a, b) => severityValue[b.severity] - severityValue[a.severity] || b.confidence - a.confidence)[0] ?? null;
}

function negativeRecommendations(state: FounderIntelligenceState): NegativeRecommendation[] {
  const recommendations: NegativeRecommendation[] = [];
  const evidenceGap = state.signals.find((s) => s.type === "EVIDENCE_GAP" || s.type === "ASSUMPTION_DECAY");
  const drift = state.signals.find((s) => s.type === "GOAL_SLIPPAGE" || s.type === "BUSYWORK_PATTERN");
  const rejection = state.signals.find((s) => s.type === "RECOMMENDATION_REJECTION_PATTERN");

  if (evidenceGap) recommendations.push({
    type: "validate_before_building",
    statement: "Do not add another product feature before gathering fresh external evidence.",
    reason: "The current constraint is uncertainty, so more building is unlikely to resolve the decision that matters.",
    evidence: signalEvidence(evidenceGap), confidence: evidenceGap.confidence,
  });
  if (drift) recommendations.push({
    type: "defer",
    statement: "Defer roadmap expansion until the active goal has an evidence-producing next step.",
    reason: "Observed work is drifting away from the stated priority.",
    evidence: signalEvidence(drift), confidence: drift.confidence,
  });
  if (rejection) recommendations.push({
    type: "reduce",
    statement: "Do not repeat the same recommendation format without changing the size, channel, or support around it.",
    reason: "Repeated rejection means the current intervention is not landing as designed.",
    evidence: signalEvidence(rejection), confidence: rejection.confidence,
  });
  return recommendations.slice(0, 3);
}

function interventionFor(state: FounderIntelligenceState, top: IntelligenceSignal | null): InterventionState {
  if (!top) return { should_intervene: false, mode: "passive_insight", intensity: 20, reason: "No material contradiction or risk signal is active.", evidence: [], founder_awareness: "unknown" };
  const intensity = Math.min(100, severityValue[top.severity] * 20 + Math.round(top.confidence * 20));
  const mode: InterventionMode = top.severity === "critical" ? "escalation" : top.severity === "high" ? "challenge" : top.severity === "medium" ? "suggestion" : "passive_insight";
  const awareness = top.type === "REPEATED_AVOIDANCE" || top.type === "BUSYWORK_PATTERN" ? "likely_unaware" : "likely_aware";
  return { should_intervene: top.severity !== "low", mode, intensity, reason: top.summary, evidence: signalEvidence(top), founder_awareness: awareness };
}

export function buildCofounderJudgment(state: FounderIntelligenceState): CofounderJudgment {
  const top = highestSignal(state);
  const candidate = state.decision.top_candidate;
  const constraint = top?.summary ?? "No high-confidence constraint has been detected yet.";
  const evidence = top ? signalEvidence(top) : state.startup.evidence.slice(0, 3);
  const known = state.startup.evidence.slice(0, 4);
  const inferred = state.signals.slice(0, 3).map((s) => s.summary);
  const unknown = state.startup.evidence.length ? [] : ["Whether recent work changed a real customer or market outcome."];
  return {
    what_matters_now: candidate?.action ?? constraint,
    largest_constraint: constraint,
    neglected_area: top?.type === "EVIDENCE_GAP" ? "External customer or market evidence" : top?.type === "REPEATED_AVOIDANCE" ? "The repeatedly avoided high-leverage work" : null,
    opportunity_cost: candidate ? `Choosing a lower-ranked task delays ${candidate.expected_evidence.toLowerCase()}.` : "The next action has not been ranked with enough evidence yet.",
    highest_leverage_action: candidate?.action ?? null,
    should_not_do: negativeRecommendations(state),
    reasoning: top ? [{
      observation: top.summary,
      interpretation: `The active constraint is ${top.type.toLowerCase().replace(/_/g, " ")}.`,
      evidence, confidence: top.confidence,
      implication: candidate ? `The next action should create evidence against this constraint.` : "Collect enough evidence to rank a next action.",
      recommended_action: candidate?.action ?? top.recommended_response,
      uncertainty: state.founder.confidence < 45 ? "Pattern confidence is limited by a short or inconsistent history." : "The signal may change with fresh founder context.",
      smallest_evidence_to_resolve: candidate?.expected_evidence ?? "One observable external outcome tied to the active goal.",
    }] : [],
    intervention: interventionFor(state, top),
    uncertainty: { known, inferred, unknown },
  };
}

export function evaluateFounderProposal(proposal: string, state: FounderIntelligenceState): ProposalEvaluation {
  const normalized = proposal.toLowerCase();
  const isBuild = /build|feature|code|redesign|refactor|ship|ui|website/.test(normalized);
  const isEvidenceWork = /customer|user|interview|call|message|email|outreach|validate|research|feedback|sell|pricing/.test(normalized);
  const judgment = buildCofounderJudgment(state);
  const evidenceGap = state.signals.find((s) => s.type === "EVIDENCE_GAP" || s.type === "ASSUMPTION_DECAY");
  const conflict = state.signals.find((s) => s.type === "GOAL_SLIPPAGE" || s.type === "BUSYWORK_PATTERN");
  const support = state.signals.filter((s) => normalized.includes(s.type.toLowerCase().replace(/_/g, " "))).flatMap(signalEvidence);
  const contradiction = [evidenceGap, conflict].filter(Boolean).flatMap((s) => signalEvidence(s!));
  const alternative = judgment.highest_leverage_action;

  if (!state.source_summary.reflections && !state.source_summary.activity_events) return {
    decision: "investigate", problem_solved: "The proposed work has not yet been linked to an observed bottleneck.", current_bottleneck: judgment.largest_constraint,
    supporting_evidence: support, contradicting_evidence: contradiction, opportunity_cost: "Acting now could optimize an assumption before there is behavioral history.", alternatives: ["Collect one customer or execution observation first."], higher_leverage_action: alternative, confidence: 0.3,
    rationale: "There is not enough observed history to responsibly agree or disagree.",
  };
  if (isBuild && evidenceGap) return {
    decision: "defer", problem_solved: "It may improve the product, but it does not resolve the current evidence gap.", current_bottleneck: evidenceGap.summary,
    supporting_evidence: support, contradicting_evidence: signalEvidence(evidenceGap), opportunity_cost: `Building this now delays ${alternative ?? "the highest-leverage evidence step"}.`, alternatives: [alternative ?? "Run one external validation action."].filter(Boolean), higher_leverage_action: alternative, confidence: evidenceGap.confidence,
    rationale: "The cofounder disagrees with the sequence, not necessarily the idea: validate the assumption before investing in implementation.",
  };
  if (isEvidenceWork && evidenceGap) return {
    decision: "agree", problem_solved: "It directly reduces the active evidence gap.", current_bottleneck: evidenceGap.summary,
    supporting_evidence: signalEvidence(evidenceGap), contradicting_evidence: [], opportunity_cost: "The main cost is delaying lower-leverage implementation work.", alternatives: [alternative ?? "Keep the action narrow and measurable."].filter(Boolean), higher_leverage_action: alternative, confidence: Math.max(0.55, evidenceGap.confidence),
    rationale: "The proposal is directionally aligned with the current constraint. Keep it concrete enough to produce observable evidence.",
  };
  return {
    decision: conflict ? "agree_with_modification" : "agree", problem_solved: "The proposal appears connected to the current operating goal.", current_bottleneck: judgment.largest_constraint,
    supporting_evidence: support, contradicting_evidence: contradiction, opportunity_cost: alternative && alternative !== proposal ? `It displaces ${alternative}.` : "No clearly higher-ranked alternative is currently known.", alternatives: [alternative ?? "Define a measurable result before starting."].filter(Boolean), higher_leverage_action: alternative, confidence: Math.max(0.4, state.founder.confidence / 100),
    rationale: conflict ? "Proceed only after narrowing the work to the stated priority and defining the evidence it should produce." : "No high-confidence evidence says this is the wrong next move.",
  };
}

export function buildCofounderJudgmentPromptBlock(judgment: CofounderJudgment): string {
  const lines = [
    "DIGITAL COFOUNDER JUDGMENT (deterministic; preserve its epistemic boundaries):",
    `What matters now: ${judgment.what_matters_now}`,
    `Largest constraint: ${judgment.largest_constraint}`,
    `Opportunity cost: ${judgment.opportunity_cost}`,
    `Intervention: ${judgment.intervention.mode} (${judgment.intervention.intensity}/100). ${judgment.intervention.reason}`,
  ];
  if (judgment.should_not_do.length) lines.push(`Negative recommendation: ${judgment.should_not_do.map((item) => item.statement).join(" ")}`);
  if (judgment.uncertainty.unknown.length) lines.push(`Unknown: ${judgment.uncertainty.unknown.join(" ")}`);
  lines.push("INSTRUCTION: Separate observation from interpretation, state uncertainty, challenge a proposal when its opportunity cost is high, and name the smallest evidence that would change the recommendation.");
  return lines.join("\n");
}
