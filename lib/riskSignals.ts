/**
 * lib/riskSignals.ts — Pure churn/risk scoring over founder-logged signals
 *
 * BACKGROUND: Risk Interrupt and Recovery Mode (risk-based) both need a
 * churn probability + revenue-at-risk figure, but BuildMind has no direct
 * integration with a founder's support desk, CRM, or NPS tool at this
 * stage. The practical MVP source is a founder-logged event log —
 * support ticket escalations, NPS scores, direct customer warnings — one
 * row per event (see project_risk_signals table / supabase migration
 * 20260827000000). This module turns those rows into a score.
 *
 * All functions here are pure — no I/O, no Supabase — so they're cheap to
 * unit test and safe to call from both server routes and (if ever needed)
 * client code.
 */

export type SignalType = "support_ticket" | "nps_score" | "customer_message" | "other";
export type SignalSeverity = "critical" | "warning" | "neutral" | "positive";

export interface RiskSignal {
  id: string;
  signal_type: SignalType;
  severity: SignalSeverity;
  value: number | null;
  note: string;
  customer_name: string | null;
  mrr_at_risk: number | null;
  created_at: string; // ISO timestamp
}

export interface ChurnRiskAssessment {
  /** 0-100. How likely the at-risk account(s) are to churn. */
  churnProbability: number;
  /** Estimated MRR exposed, deduped by customer_name (max signal per account, not summed). */
  burnAtRisk: number;
  /** Signals within the lookback window, most recent first. */
  recentSignals: RiskSignal[];
  /** Count of severity: 'critical' signals within the lookback window. */
  criticalCount: number;
  /** The account with the most severe recent signal, if any. */
  topAccount: string | null;
}

const LOOKBACK_DAYS = 14;
const SEVERITY_WEIGHT: Record<SignalSeverity, number> = {
  critical: 34,
  warning: 16,
  neutral: 4,
  positive: -20,
};

function withinLookback(iso: string, days: number, now: number): boolean {
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts <= days * 24 * 60 * 60 * 1000;
}

/**
 * computeChurnRisk — turns a project's recent risk signals into a single
 * assessment. Deterministic, no LLM: churn probability is a weighted sum
 * of severity (critical/warning/neutral/positive) over a 14-day window,
 * with an NPS-score adjustment layered on top when scores are present.
 */
export function computeChurnRisk(signals: RiskSignal[], now: number = Date.now()): ChurnRiskAssessment {
  const recentSignals = signals
    .filter((s) => withinLookback(s.created_at, LOOKBACK_DAYS, now))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (recentSignals.length === 0) {
    return { churnProbability: 0, burnAtRisk: 0, recentSignals: [], criticalCount: 0, topAccount: null };
  }

  let weighted = 0;
  for (const s of recentSignals) {
    weighted += SEVERITY_WEIGHT[s.severity];
    if (s.signal_type === "nps_score" && typeof s.value === "number") {
      // NPS 0-10 → push weight up as the score drops below 6 (detractor territory).
      if (s.value <= 6) weighted += (6 - s.value) * 6;
      else weighted -= (s.value - 6) * 3; // promoter scores pull risk down
    }
  }

  const churnProbability = Math.max(0, Math.min(100, Math.round(weighted)));
  const criticalCount = recentSignals.filter((s) => s.severity === "critical").length;

  // Burn at risk: dedupe by customer_name, take the highest mrr_at_risk
  // named for that account rather than summing (a founder logging three
  // tickets for the same account shouldn't triple-count that account's MRR).
  const byAccount = new Map<string, number>();
  for (const s of recentSignals) {
    if (!s.customer_name || typeof s.mrr_at_risk !== "number") continue;
    const existing = byAccount.get(s.customer_name) ?? 0;
    byAccount.set(s.customer_name, Math.max(existing, s.mrr_at_risk));
  }
  const burnAtRisk = Array.from(byAccount.values()).reduce((sum, v) => sum + v, 0);

  const topAccount =
    recentSignals.find((s) => s.severity === "critical" && s.customer_name)?.customer_name ??
    recentSignals.find((s) => s.customer_name)?.customer_name ??
    null;

  return { churnProbability, burnAtRisk, recentSignals, criticalCount, topAccount };
}

/**
 * shouldTriggerRiskInterrupt — the gate Today's brief generation checks
 * before showing Risk Interrupt instead of a normal recommendation.
 * Deliberately conservative: interrupts are disruptive, so this requires
 * either a real cluster of bad signals or one severe single signal, not
 * just "some risk exists."
 */
export function shouldTriggerRiskInterrupt(assessment: ChurnRiskAssessment): boolean {
  if (assessment.churnProbability >= 70) return true;
  if (assessment.criticalCount >= 2) return true;
  if (assessment.criticalCount >= 1 && assessment.burnAtRisk >= 1000) return true;
  return false;
}

/** Human-readable summary line, e.g. for the Recovery Mission headline. */
export function describeChurnRisk(assessment: ChurnRiskAssessment): string {
  if (assessment.recentSignals.length === 0) return "No risk signals logged in the last 14 days.";
  const who = assessment.topAccount ?? "an account";
  return `${who} shows ${assessment.churnProbability}% churn probability from ${assessment.recentSignals.length} recent signal${assessment.recentSignals.length === 1 ? "" : "s"}.`;
}

export interface RecoveryMission {
  title: string;
  contextParagraph: string;
  requiredSteps: string[];
  churnProbability: number;
  burnAtRisk: number;
  evidence: { label: string; createdAt: string }[];
}

const SIGNAL_TYPE_LABEL: Record<SignalType, string> = {
  support_ticket: "Support ticket",
  nps_score: "NPS score",
  customer_message: "Customer message",
  other: "Signal",
};

function formatEvidenceLine(s: RiskSignal): string {
  const type = SIGNAL_TYPE_LABEL[s.signal_type];
  if (s.signal_type === "nps_score" && typeof s.value === "number") return `${type}: ${s.value}`;
  return `${type}${s.note ? `: ${s.note}` : ""}`;
}

/**
 * buildRecoveryMission — turns a churn risk assessment into the same
 * concrete, numbers-first mission copy the Figma reference uses
 * ("Your largest enterprise account has escalated 3 support tickets and
 * NPS dropped to 3. Revenue at risk: $4,200/mo…"). Deliberately
 * deterministic/templated rather than AI-generated: the founder logged
 * these exact events, so the mission should say back exactly what was
 * logged, not a paraphrase.
 */
export function buildRecoveryMission(assessment: ChurnRiskAssessment): RecoveryMission {
  const who = assessment.topAccount ?? "An account";
  const critical = assessment.recentSignals.filter((s) => s.severity === "critical");
  const count = assessment.recentSignals.length;

  const contextParts: string[] = [];
  if (critical.length > 0) {
    contextParts.push(`${who} has logged ${critical.length} critical signal${critical.length === 1 ? "" : "s"} in the last 14 days.`);
  } else {
    contextParts.push(`${who} has logged ${count} risk signal${count === 1 ? "" : "s"} in the last 14 days.`);
  }
  if (assessment.burnAtRisk > 0) {
    contextParts.push(`Revenue at risk: $${assessment.burnAtRisk.toLocaleString()}/mo.`);
  }
  contextParts.push("A direct conversation with the decision-maker is the fastest path to resolution.");

  return {
    title: `Resolve customer churn risk — ${who} requires immediate intervention`,
    contextParagraph: contextParts.join(" "),
    requiredSteps: [
      "Draft a personal apology and action-plan message",
      "Schedule a call within 24 hours",
      "Document the resolution for future prevention",
    ],
    churnProbability: assessment.churnProbability,
    burnAtRisk: assessment.burnAtRisk,
    evidence: assessment.recentSignals
      .slice(0, 5)
      .map((s) => ({ label: formatEvidenceLine(s), createdAt: s.created_at })),
  };
}
