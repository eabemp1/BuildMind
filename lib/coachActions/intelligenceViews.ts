/**
 * lib/coachActions/intelligenceViews.ts
 *
 * Pure builders that turn Founder Intelligence data into Coach Action result
 * cards. They take the SAME shapes Founder Mirror renders (lib/founderMirror.ts
 * exports them) and the scorecard — nothing here computes an intelligence
 * value itself, so the coach can't say something Founder Mirror wouldn't.
 *
 * Every sentence is a template over real fields; no model writes any of it.
 */

import type { FounderBelief, MirrorDecisionAlternative, MirrorDecisionTop, MirrorSignal } from "@/lib/founderMirror";
import type { FounderScorecard } from "@/lib/scorecard";
import type { CoachActionResult } from "./types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

// ── Signals ────────────────────────────────────────────────────────────────
const SEVERITY_RANK: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

export function buildSignalsResult(signals: MirrorSignal[], limit: number): CoachActionResult {
  if (signals.length === 0) {
    return {
      actionId: "get_signals",
      title: "Active signals",
      summary: "BuildMind isn't flagging any active signals right now.",
      note: "Signals appear when your logged behavior shows a pattern — a stalled milestone, a sharp momentum change, repeated skips. They fade on their own if the pattern stops.",
    };
  }
  const sorted = [...signals].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0) || b.decayed_confidence - a.decayed_confidence,
  );
  const high = sorted.filter((s) => (SEVERITY_RANK[s.severity] ?? 0) >= 3).length;
  const avgConfidence = sorted.reduce((sum, s) => sum + s.decayed_confidence, 0) / sorted.length;

  return {
    actionId: "get_signals",
    title: "Active signals",
    summary:
      high > 0
        ? `${plural(sorted.length, "active signal")} — ${high} high-severity.`
        : `${plural(sorted.length, "active signal")}, none high-severity.`,
    stats: [
      { label: "Active", value: String(sorted.length) },
      { label: "High severity", value: String(high) },
      { label: "Avg confidence", value: pct(avgConfidence) },
    ],
    rows: sorted.slice(0, limit).map((s) => ({
      primary: s.title,
      secondary: `${clip(s.summary, 160)} · ${plural(s.evidence.length, "evidence item")}`,
      detail: s.recommended_response ? `→ ${clip(s.recommended_response, 160)}` : undefined,
      badge: s.severity,
    })),
    note: sorted.length > limit ? `Showing ${limit} of ${sorted.length}, most severe first.` : "Each signal is built from your logged behavior and decays if the pattern stops.",
  };
}

// ── Decision reasoning ─────────────────────────────────────────────────────
export function buildDecisionResult(decision: { top: MirrorDecisionTop | null; alternatives: MirrorDecisionAlternative[] }): CoachActionResult {
  const { top, alternatives } = decision;
  if (!top) {
    return {
      actionId: "get_decision_reasoning",
      title: "How today's recommendation was chosen",
      summary: "There's no active recommendation right now, so there's nothing to compare.",
    };
  }
  const closest = alternatives.length ? Math.min(...alternatives.map((a) => a.gap_to_top)) : null;
  const stats: Array<{ label: string; value: string }> = [
    { label: "Chosen score", value: String(Math.round(top.score)) },
    { label: "Alternatives scored", value: String(alternatives.length) },
  ];
  if (closest !== null) stats.push({ label: "Closest runner-up", value: `−${closest}` });

  return {
    actionId: "get_decision_reasoning",
    title: "How today's recommendation was chosen",
    summary:
      alternatives.length > 0
        ? `Current pick: "${clip(top.action, 110)}". ${plural(alternatives.length, "alternative")} scored lower.`
        : `Current pick: "${clip(top.action, 110)}". No alternatives were scored against it.`,
    stats,
    rows: [
      {
        primary: top.action,
        secondary: top.rationale,
        detail: top.why_it_beats_alternatives ? `Why it won: ${top.why_it_beats_alternatives}` : undefined,
        badge: `chosen · ${Math.round(top.score)}`,
      },
      ...alternatives.map((a) => ({ primary: a.action, secondary: a.rationale, badge: `−${a.gap_to_top}` })),
    ],
    note: "Scores come from your own history and current signals — the same scoring Today uses, not a fresh guess.",
  };
}

// ── Beliefs (what BuildMind currently believes about the founder) ──────────
export function buildBeliefsResult(
  beliefs: FounderBelief[], suppressed: Array<{ belief: string; reason: string }>, limit: number,
): CoachActionResult {
  if (beliefs.length === 0) {
    return {
      actionId: "get_beliefs",
      title: "What BuildMind believes about you",
      summary: "BuildMind doesn't have enough history to hold beliefs about you yet.",
      note: "They form as you complete, skip, and reflect on actions — there's no quiz, only what you actually do.",
    };
  }
  const avg = beliefs.reduce((sum, b) => sum + b.confidence, 0) / beliefs.length;
  const note = [
    beliefs.length > limit ? `Showing ${limit} of ${beliefs.length}.` : null,
    suppressed.length ? `Softened out after your corrections: ${suppressed.map((s) => `"${clip(s.belief, 60)}"`).join(", ")}.` : null,
    "These are inferences from your logged behavior. You can correct any of them in Founder Mirror.",
  ].filter(Boolean).join(" ");

  return {
    actionId: "get_beliefs",
    title: "What BuildMind believes about you",
    summary: `${plural(beliefs.length, "belief")} about you, ${pct(avg)} average confidence.`,
    stats: [
      { label: "Beliefs", value: String(beliefs.length) },
      { label: "Avg confidence", value: pct(avg) },
      { label: "Corrected by you", value: String(beliefs.filter((b) => b.correction_effect).length + suppressed.length) },
    ],
    rows: [...beliefs].sort((a, b) => b.confidence - a.confidence).slice(0, limit).map((b) => ({
      primary: b.belief,
      secondary: `${b.why} (${b.trend})`,
      detail: b.correction_effect
        ? `Softened by ${plural(b.correction_effect.corrections_applied, "correction")}: ${pct(b.correction_effect.confidence_before)} → ${pct(b.correction_effect.confidence_after)}`
        : b.evidence.length
          ? `Based on ${plural(b.evidence.length, "logged action")}`
          : undefined,
      badge: pct(b.confidence),
    })),
    note,
  };
}

// ── Momentum (scorecard — the single source of truth) ──────────────────────
export function buildMomentumResult(sc: Pick<FounderScorecard, "momentum" | "momentumLabel" | "momentumDelta" | "momentumTrend" | "streak" | "xp" | "isDecaying">): CoachActionResult {
  const delta = sc.momentumDelta;
  const deltaClause =
    delta == null ? "no week-ago baseline yet"
    : delta === 0 ? "unchanged from a week ago"
    : `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} from a week ago`;
  const streakClause = sc.streak > 0 ? `${plural(sc.streak, "day")} streak` : "no active streak";

  return {
    actionId: "get_momentum",
    title: "Momentum",
    summary: `Momentum is ${sc.momentum} (${sc.momentumLabel.label}), ${deltaClause}. ${streakClause[0].toUpperCase()}${streakClause.slice(1)}.${sc.isDecaying ? " It's currently decaying." : ""}`,
    stats: [
      { label: "Momentum", value: String(sc.momentum) },
      { label: "vs last week", value: delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}` },
      { label: "Streak", value: `${sc.streak}d` },
      { label: "XP", value: String(sc.xp) },
    ],
  };
                                                 }
