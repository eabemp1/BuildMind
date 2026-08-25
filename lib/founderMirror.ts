/**
 * lib/founderMirror.ts — Phase 9: The Founder Mirror
 *
 * A continuously-evolving, behavior-derived model that answers:
 *   - What does BuildMind currently believe about me?
 *   - Why does it believe it, and what's the evidence?
 *   - How confident is it?
 *   - What changed recently?
 *   - What patterns are strengthening / weakening?
 *   - What might BuildMind be wrong about?
 *
 * Deliberately NOT a personality quiz. Every belief is derived from
 * FounderIntelligenceState, which is itself derived from real behavior
 * (reflections, task outcomes, activity, recommendation acceptance/rejection).
 * No belief is stated without a link back to the evidence that produced it.
 *
 * Consumers: app/api/founder-context/mirror/route.ts (and, later, a Founder
 * Mirror UI surface — see Phase 10/12: existing surfaces stay, this layers
 * on top).
 */

import type { FounderIntelligenceState } from "@/lib/founderIntelligence";
import type { IntelligenceAccuracy } from "@/lib/learningLoop";
import { buildFounderSkills, type FounderSkill } from "@/lib/founderSkills";

export interface FounderBelief {
  belief: string;
  why: string;
  evidence: string[];
  confidence: number; // 0-1
  trend: "strengthening" | "weakening" | "persistent" | "emerging";
  last_updated: string;
  contradictory_evidence: string[];
}

export interface FounderMirror {
  beliefs: FounderBelief[];
  skills: FounderSkill[];
  recent_changes: string[];
  strengthening_patterns: string[];
  weakening_patterns: string[];
  may_be_wrong_about: string[];
  self_reported_accuracy: {
    sample_size: number;
    accuracy_pct: number | null;
    trend: IntelligenceAccuracy["trend"];
    summary: string;
  };
  generated_at: string;
}

function beliefsFromState(state: FounderIntelligenceState): FounderBelief[] {
  const beliefs: FounderBelief[] = [];

  for (const strength of state.founder.strengths.slice(0, 3)) {
    beliefs.push({
      belief: `You tend to be strong at ${strength}.`,
      why: "Derived from which recommendation and task types you actually complete, not a self-report.",
      evidence: state.execution.completed_actions.slice(0, 3),
      confidence: Math.max(0.3, state.founder.confidence / 100),
      trend: state.temporal.strengthening_patterns.length ? "strengthening" : "persistent",
      last_updated: state.generated_at,
      contradictory_evidence: state.founder.corrections.map((item) => item.correction).slice(-2),
    });
  }

  for (const avoidance of state.founder.avoidance_patterns.slice(0, 3)) {
    beliefs.push({
      belief: `You tend to avoid ${avoidance}.`,
      why: "Derived from repeated skips, overrides, or delays around this category of work.",
      evidence: [...state.execution.skipped_actions.slice(0, 2), ...state.execution.delayed_actions.slice(0, 1)].filter(Boolean),
      confidence: Math.max(0.25, (state.founder.confidence / 100) * 0.9),
      trend: state.temporal.weakening_patterns.length ? "weakening" : "persistent",
      last_updated: state.generated_at,
      contradictory_evidence: state.founder.corrections.map((item) => item.correction).slice(-2),
    });
  }

  for (const window of state.founder.operating_windows) {
    beliefs.push({
      belief: window,
      why: "Derived from timestamps of your completed vs. dropped activity, not a stated preference.",
      evidence: [],
      confidence: 0.5,
      trend: "emerging",
      last_updated: state.generated_at,
      contradictory_evidence: [],
    });
  }

  return beliefs.slice(0, 8);
}

function mayBeWrongAbout(state: FounderIntelligenceState, accuracy: IntelligenceAccuracy): string[] {
  const items: string[] = [];

  if (state.founder.confidence < 40) {
    items.push("There isn't much history yet, so the strengths/avoidance beliefs above are low-confidence and may shift quickly.");
  }
  for (const contradiction of state.strategy.contradictions.slice(0, 2)) {
    items.push(`Possible contradiction it hasn't resolved: ${contradiction}`);
  }
  if (accuracy.sample_size >= 5 && accuracy.average_match_score < 0.4) {
    items.push("Recent recommendations haven't matched what you actually did — its model of what you need next may be stale.");
  }
  for (const correction of state.founder.corrections.slice(-2)) {
    items.push(`Founder correction to retain: BuildMind believed "${correction.belief}", but the founder said "${correction.correction}".`);
  }
  if (!items.length) {
    items.push("No unresolved contradictions detected right now; confidence in the beliefs above is as good as it currently gets.");
  }
  return items.slice(0, 4);
}

function accuracySummary(accuracy: IntelligenceAccuracy): string {
  if (!accuracy.sample_size) return "Not enough resolved recommendations yet to self-score accuracy.";
  const pct = Math.round(accuracy.average_match_score * 100);
  const trendText = accuracy.trend === "up" ? "and improving" : accuracy.trend === "down" ? "but slipping" : accuracy.trend === "flat" ? "and holding steady" : "";
  return `Its recommendations have matched what you actually did about ${pct}% of the time over the last ${accuracy.sample_size} resolved recommendations${trendText ? `, ${trendText}` : "."}`;
}

/**
 * Builds the Founder Mirror from the already-computed FounderIntelligenceState
 * plus the rolling prediction accuracy from the learning loop (Phase 11).
 * Pure/deterministic — no LLM call, so it's cheap enough to compute on every
 * page load (Phase 13: model cost control).
 */
export function buildFounderMirror(state: FounderIntelligenceState, accuracy: IntelligenceAccuracy): FounderMirror {
  return {
    beliefs: beliefsFromState(state),
    skills: buildFounderSkills(state),
    recent_changes: state.founder.recent_changes,
    strengthening_patterns: state.temporal.strengthening_patterns,
    weakening_patterns: state.temporal.weakening_patterns,
    may_be_wrong_about: mayBeWrongAbout(state, accuracy),
    self_reported_accuracy: {
      sample_size: accuracy.sample_size,
      accuracy_pct: accuracy.sample_size ? Math.round(accuracy.average_match_score * 100) : null,
      trend: accuracy.trend,
      summary: accuracySummary(accuracy),
    },
    generated_at: state.generated_at,
  };
}
