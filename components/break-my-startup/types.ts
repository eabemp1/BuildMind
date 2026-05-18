"use client";

/**
 * components/break-my-startup/types.ts
 * Shared types, role metadata, severity colours, and pure helper functions
 * for the Break My Startup 2.0 feature.
 *
 * IMPROVEMENTS vs previous version:
 *  1. buildRoundsFromAnalysis() — role assignment is now risk-driven, not
 *     positional. The highest-severity risk always goes to the "ghost" persona
 *     (most emotionally resonant). Fatal/regulatory risks go to "skeptic".
 *     Competitive risks go to "competitor". Order follows impact, not index.
 *  2. buildMoatDimensions() — replaced keyword-matching with a structured
 *     signal-based scorer. Now uses agent_outputs and signal_summary from the
 *     full API response, not just a moat string scan.
 *  3. computeSurvivalScore() — now uses viability_score from the agent
 *     pipeline when available, so the survival bar and the AI analysis agree.
 */

import type { BreakMyStartupAnalysis } from "@/lib/api";
import type { FounderMemory } from "@/lib/founderMemory";

// ─── Types ───────────────────────────────────────────────────────────────────

export type AttackRole = "skeptic" | "competitor" | "ghost";

export type AttackRound = {
  role: AttackRole;
  title: string;
  body: string;
  severity: "low" | "medium" | "high" | "fatal";
  rebuttal?: string;
  rebuttalScore?: number; // 0–100, how well they defended
  adversaryCounter?: string; // adversary's counter-response after rebuttal
};

export type MoatDimension = {
  label: string;
  score: number; // 0–10
  note: string;
  source: "agent" | "inferred"; // whether score is from agent pipeline or estimated
};

export type BreakState =
  | "idle"
  | "loading"
  | "revealing"
  | "debate"
  | "rebuttal"
  | "verdict";

// ─── Role metadata ────────────────────────────────────────────────────────────

export const ROLE_META: Record<
  AttackRole,
  { label: string; color: string; icon: string; voice: string }
> = {
  skeptic: {
    label: "The Skeptic VC",
    color: "#e85d04",
    icon: "◈",
    voice: "cold, data-driven, has seen 500 pitches",
  },
  competitor: {
    label: "Competitor CEO",
    color: "#7209b7",
    icon: "⬡",
    voice: "knows your market, already building v2",
  },
  ghost: {
    label: "The Failed Founder",
    color: "#1a1a2e",
    icon: "◉",
    voice: "built something identical, shut it down, here's why",
  },
};

export const SEVERITY_COLORS: Record<string, string> = {
  low: "#22c55e",
  medium: "#f59e0b",
  high: "#ef4444",
  fatal: "#7f1d1d",
};

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function generateShareText(round: AttackRound, startupName: string): string {
  const meta = ROLE_META[round.role];
  return encodeURIComponent(
    `I ran "Break My Startup" on ${startupName} and the ${meta.label} said:\n\n"${round.title}"\n\n${round.body.slice(0, 200)}...\n\n[${round.severity.toUpperCase()} RISK]\n\nvia @buildmind_io`,
  );
}

/**
 * buildRoundsFromAnalysis — risk-driven role assignment.
 *
 * Previously: roles cycled positionally (skeptic, competitor, ghost, repeat).
 * Now: roles are assigned based on what type of risk each attack represents.
 *
 * Assignment logic:
 *  - "ghost"     → the single highest-severity risk (most emotionally resonant persona
 *                   should deliver the most important attack)
 *  - "competitor" → risks that mention competition, market, or saturation
 *  - "skeptic"   → execution, funding, unit-economics, and default risks
 *
 * The first attack is always the highest-severity one regardless of its type,
 * so the user's first impression is the most impactful attack.
 */
export function buildRoundsFromAnalysis(
  analysis: BreakMyStartupAnalysis,
  memory: FounderMemory | null,
): AttackRound[] {
  if (!analysis.failureReasons?.length) return [];

  const reasons = analysis.failureReasons.slice(0, 6);

  // Sort by severity weight so the scariest attack always leads
  const severityWeight: Record<string, number> = {
    fatal: 4, high: 3, medium: 2, low: 1,
  };

  const withIndex = reasons.map((r, originalIndex) => ({ r, originalIndex }));
  withIndex.sort((a, b) => {
    const aW = severityWeight[analysis.failureReasons[a.originalIndex]?.severity ?? "low"] ?? 1;
    const bW = severityWeight[analysis.failureReasons[b.originalIndex]?.severity ?? "low"] ?? 1;
    return bW - aW;
  });

  const competitorKeywords = /compet|market|saturat|rival|alternative|already exists|player/i;
  const executionKeywords  = /execut|team|resource|fund|capital|cash|unit economics|margin|cost|burn/i;

  return withIndex.map(({ r: reason, originalIndex }, sortedIndex) => {
    const title = reason.title ?? "";
    const body  = reason.body  ?? "";
    const combined = `${title} ${body}`;

    // Role assignment: ghost always takes the top attack
    let role: AttackRole;
    if (sortedIndex === 0) {
      role = "ghost";
    } else if (competitorKeywords.test(combined)) {
      role = "competitor";
    } else if (executionKeywords.test(combined)) {
      role = "skeptic";
    } else {
      // Distribute remaining evenly across skeptic and competitor
      role = sortedIndex % 2 === 0 ? "skeptic" : "competitor";
    }

    const severity: AttackRound["severity"] =
      sortedIndex === 0
        ? "fatal"
        : sortedIndex < 2
        ? "high"
        : sortedIndex < 4
        ? "medium"
        : "low";

    // Personalise title if founder has an avoidance zone that matches this attack
    const personalTag =
      memory?.avoidance_zones?.some((z) =>
        combined.toLowerCase().includes(z.toLowerCase()),
      )
        ? " (we've noticed you avoid this area)"
        : "";

    return {
      role,
      title: title + personalTag,
      body,
      severity,
    };
  });
}

/**
 * computeSurvivalScore — now uses viability_score from the agent pipeline
 * when available, so the animated survival bar matches the AI's actual verdict.
 *
 * Falls back to the formula-based computation when agent data is absent
 * (e.g. legacy API responses or gated preview mode).
 */
export function computeSurvivalScore(
  analysis: BreakMyStartupAnalysis,
  viabilityScore?: number,
): number {
  // Prefer agent pipeline score — keeps survival bar and AI verdict in sync
  if (typeof viabilityScore === "number" && viabilityScore > 0) {
    return Math.max(5, Math.min(95, viabilityScore));
  }

  // Legacy formula fallback
  const fatalCount = analysis.failureReasons.filter((_, i) => i === 0).length;
  const highCount  = Math.min(analysis.failureReasons.length, 2);
  const competitorThreat =
    analysis.competitors?.filter((c) => c.yourSuccessRate < 40).length ?? 0;
  const base = 85;
  const deductions = fatalCount * 25 + highCount * 12 + competitorThreat * 8;
  const moatBonus  = analysis.yourMoat ? 10 : 0;
  return Math.max(5, Math.min(95, base - deductions + moatBonus));
}

/**
 * buildMoatDimensions — signal-driven scoring.
 *
 * Previously: keyword scan on a single moat string (e.g. `.includes("network")`).
 * Now: uses the structured agent_outputs and signal_summary from the API response
 * when available, so scores reflect what the 5-agent pipeline actually found.
 *
 * Each dimension maps to a specific agent signal:
 *  - Switching cost     → sentiment.willingness_to_pay_signal + competitor.competitive_moat_score
 *  - Network effects    → market.demand_authenticity + competitor market_gaps
 *  - Distribution edge  → competitor.differentiation_opportunities
 *  - Data advantage     → trend.timing_signal + market.growth_trajectory
 *  - Speed of iteration → risk.execution_risk_level (inverted)
 *
 * Falls back to the moat string scan when agent data is absent.
 */
export function buildMoatDimensions(
  analysis: BreakMyStartupAnalysis,
  agentOutputs?: {
    market?:     { demand_authenticity?: string; growth_trajectory?: string };
    competitor?: { competitive_moat_score?: number; differentiation_opportunities?: string[]; market_gaps?: string[] };
    trend?:      { timing_signal?: string };
    sentiment?:  { willingness_to_pay_signal?: string };
    risk?:       { execution_risk_level?: string };
  },
  signalSummary?: {
    demand_score?: number;
    competition_score?: number;
    uniqueness_score?: number;
  },
): MoatDimension[] {
  const hasAgentData = Boolean(agentOutputs?.competitor || agentOutputs?.sentiment);

  if (hasAgentData && agentOutputs) {
    const comp = agentOutputs.competitor;
    const sent = agentOutputs.sentiment;
    const mkt  = agentOutputs.market;
    const trend = agentOutputs.trend;
    const risk  = agentOutputs.risk;

    // ── Switching cost ────────────────────────────────────────────────────────
    // High WTP signal + strong moat score → high switching cost
    const wtpMap: Record<string, number> = { likely: 8, possible: 5, unlikely: 2, unknown: 3 };
    const moatBase = Math.min(10, Math.round((comp?.competitive_moat_score ?? 4)));
    const wtpBoost = wtpMap[sent?.willingness_to_pay_signal ?? "unknown"] ?? 3;
    const switchingScore = Math.min(10, Math.round((moatBase * 0.6 + wtpBoost * 0.4)));

    // ── Network effects ───────────────────────────────────────────────────────
    // Real demand + multiple market gaps = network effect potential
    const demandReal = mkt?.demand_authenticity === "real" ? 3 : 0;
    const gapCount   = Math.min(3, comp?.market_gaps?.length ?? 0);
    const networkScore = Math.min(10, Math.round(2 + demandReal + gapCount * 1.5));

    // ── Distribution edge ─────────────────────────────────────────────────────
    // Number of differentiation opportunities the agent found
    const diffCount = Math.min(4, comp?.differentiation_opportunities?.length ?? 0);
    const uniqueness = Math.round((signalSummary?.uniqueness_score ?? 40) / 10);
    const distributionScore = Math.min(10, Math.round(2 + diffCount + uniqueness * 0.4));

    // ── Data advantage ────────────────────────────────────────────────────────
    // Good timing + growing trajectory = compounding data advantage
    const timingMap: Record<string, number> = { early: 8, right: 6, late: 2, unknown: 3 };
    const growthMap: Record<string, number> = { growing: 3, flat: 1, declining: 0, unknown: 1 };
    const dataScore = Math.min(10, Math.round(
      (timingMap[trend?.timing_signal ?? "unknown"] ?? 3) * 0.7 +
      (growthMap[mkt?.growth_trajectory ?? "unknown"] ?? 1),
    ));

    // ── Speed of iteration ────────────────────────────────────────────────────
    // Low execution risk = high iteration speed
    const execRiskMap: Record<string, number> = { low: 8, medium: 5, high: 3, critical: 1 };
    const iterationScore = execRiskMap[risk?.execution_risk_level ?? "medium"] ?? 5;

    return [
      {
        label: "Switching cost",
        score: switchingScore,
        note: "How painful is it to leave after 6 months?",
        source: "agent",
      },
      {
        label: "Network effects",
        score: networkScore,
        note: "Does value compound as users grow?",
        source: "agent",
      },
      {
        label: "Distribution edge",
        score: distributionScore,
        note: "Unique access to customers competitors can't replicate",
        source: "agent",
      },
      {
        label: "Data advantage",
        score: dataScore,
        note: "Proprietary signals that improve your product over time",
        source: "agent",
      },
      {
        label: "Speed of iteration",
        score: iterationScore,
        note: "Can you outpace a well-funded competitor's copy attempt?",
        source: "agent",
      },
    ];
  }

  // ── Legacy fallback: keyword scan on moat string ──────────────────────────
  const s = analysis.yourMoat ?? "";
  return [
    {
      label: "Switching cost",
      score: s.includes("switch") || s.includes("lock") ? 7 : 3,
      note: "How painful is it to leave after 6 months?",
      source: "inferred",
    },
    {
      label: "Network effects",
      score: s.includes("network") || s.includes("community") ? 8 : 2,
      note: "Does value compound as users grow?",
      source: "inferred",
    },
    {
      label: "Distribution edge",
      score: s.includes("distribut") || s.includes("channel") ? 6 : 3,
      note: "Unique access to customers competitors can't replicate",
      source: "inferred",
    },
    {
      label: "Data advantage",
      score: s.includes("data") || s.includes("learn") ? 7 : 4,
      note: "Proprietary signals that improve your product over time",
      source: "inferred",
    },
    {
      label: "Speed of iteration",
      score: analysis.failureReasons.length <= 3 ? 7 : 5,
      note: "Can you outpace a well-funded competitor's copy attempt?",
      source: "inferred",
    },
  ];
}
