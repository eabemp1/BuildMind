/**
 * lib/server/founderStanding.ts
 *
 * The problem this fixes: by the time of this file, BuildMind had THREE
 * independently-computed answers to "is this going well" —
 *   1. computeStageReadiness()   (lib/server/stageReadiness.ts) — real,
 *      3-signal, used only inside the stage-transition moment
 *   2. Overview's inline score-threshold verdict ("Strong/Moderate/Needs
 *      attention momentum") — a flat cutoff on computeStartupScore()
 *   3. Projects-list's deriveProjectHealth() — activity recency + a score
 *      floor, labeled "Healthy/At risk/Stalled"
 * — plus a FOURTH, found while wiring the co-founder mascot:
 *   4. CofounderPulse's pickModeFromMemory() — its own momentum/streak/
 *      daysInactive thresholds, deciding the mascot's mood independently
 *      of all three above.
 *
 * None of these were wrong on their own terms. But a founder could see
 * "Healthy" on Projects, "Needs attention" on Overview, and a calm
 * "observing" mascot, all at once, all live, none of them technically
 * lying. That's the bug — not any single number.
 *
 * This file does NOT recompute readiness (computeStageReadiness already
 * does that correctly) or invent a new evidence model. It combines the
 * ALREADY-real readiness tier with ONE new signal — engagement, i.e.
 * "has this founder kept showing up" — that was previously duplicated
 * (badly) in two places. Readiness and engagement are kept as two
 * separate fields on purpose: "can you move forward" and "have you gone
 * quiet" are different questions, and a founder who is ready to advance
 * but has gone quiet for a week is a real, useful thing to be able to
 * say — collapsing them into one blended verdict would hide that.
 *
 * Every surface that currently computes its own health/mood — Overview,
 * Projects-list's badge, CofounderPulse's mode selection — should call
 * getFounderStanding() instead of thresholding raw fields itself.
 *
 * Placement note: this lives under lib/server/ alongside stageReadiness.ts
 * for topical grouping, but unlike its neighbors it has zero actual
 * server-only dependencies — no Supabase client, no admin secrets, only
 * pure functions and a type-only import of StageReadiness. That's
 * deliberate: CofounderPulse.tsx ("use client") imports deriveCofounderMode
 * directly from here, after fetching a FounderStanding object from
 * /api/founder-context/standing rather than computing one itself.
 */

import type { StageReadiness } from "@/lib/server/stageReadiness";
import type { FounderMemory } from "@/lib/founderMemory";
import type { PulseMode } from "@/components/CofounderPulse";

export type EngagementTier = "healthy" | "at-risk" | "stalled";

export interface FounderStanding {
  readiness: StageReadiness;
  engagement: EngagementTier;
  daysInactive: number;
}

/**
 * Same thresholds Projects-list's deriveProjectHealth() already used —
 * kept identical on purpose rather than re-derived, so migrating callers
 * to this function changes WHERE the number is computed, not what it says.
 */
const STALLED_AT_DAYS = 7;
const AT_RISK_AT_DAYS = 3;

export function deriveEngagement(daysInactive: number): EngagementTier {
  if (daysInactive >= STALLED_AT_DAYS) return "stalled";
  if (daysInactive >= AT_RISK_AT_DAYS) return "at-risk";
  return "healthy";
}

/**
 * getFounderStanding — combine real readiness with engagement into the
 * one object every "how is this going" surface should read from.
 *
 * Takes an already-computed StageReadiness (not raw computeStageReadiness
 * inputs) — assembling those inputs requires Supabase-specific queries
 * (milestones, reflections, evidence rows) that belong in a data-fetching
 * layer, not this pure-function module. See lib/server/projectReadiness.ts
 * ::getProjectReadiness() for that layer — it's the one real place that
 * now does the fetch, shared between this and the stage-transition
 * evaluator, instead of a third copy of the same 5 queries.
 */
export function getFounderStanding(
  readiness: StageReadiness,
  daysInactive: number,
): FounderStanding {
  return {
    readiness,
    engagement: deriveEngagement(daysInactive),
    daysInactive,
  };
}

/**
 * deriveCofounderMode — replaces CofounderPulse's pickModeFromMemory().
 *
 * The old function thresholded momentum/streak/daysInactive itself — a
 * fourth copy of "is this going well," disagreeing-by-construction with
 * Overview, Projects-list, and the readiness tier, since it never read
 * any of them. This version reads the same FounderStanding every other
 * surface now reads, and layers only the signals that are genuinely NOT
 * captured by readiness/engagement on top.
 *
 * momentumScore is kept as its own optional parameter rather than folded
 * into FounderStanding: it comes from the ALREADY-canonical Pulse engine
 * (lib/pulse.ts, /api/pulse/metrics — fixed separately, see that route's
 * FIX #8 comment), and it measures something genuinely distinct from both
 * readiness (can you move forward) and engagement (have you shown up
 * recently) — it's a decayed behavioral-consistency score. Whether
 * momentum and engagement should eventually merge into one "activity"
 * concept is an open question this file doesn't resolve; for now it's
 * named honestly as a third axis rather than silently absorbed into
 * either of the other two.
 *
 * One deliberate behavior change from the old thresholds, flagged rather
 * than hidden: the old code alerted at 3 days inactive. Engagement's
 * "at-risk" tier already starts at 3 days, but this maps at-risk to a
 * gentler "challenge" nudge and reserves "alert" for "stalled" (7+ days)
 * or a genuine momentum slide, so the mascot doesn't cry wolf on every
 * founder who skipped a weekend. This is a product choice, not a derived
 * constant — revisit with real usage data on how founders react to a
 * 3-day vs. 7-day nudge.
 */
export function deriveCofounderMode(
  standing: FounderStanding,
  memory: Pick<FounderMemory, "avoidance_zones" | "decision_patterns" | "last_insight" | "strengths">,
  momentumScore?: number,
): PulseMode {
  const { readiness, engagement } = standing;

  // Live urgency outranks everything else.
  if (engagement === "stalled") return "alert";
  if (typeof momentumScore === "number" && momentumScore < 35) return "alert";
  if (memory.decision_patterns.some((p) => p.count >= 5 && p.pattern.includes("overdue"))) return "alert";

  // Genuinely behavioral signals the standing object doesn't cover.
  if (memory.avoidance_zones.length >= 3) return "challenge";
  if (engagement === "at-risk") return "challenge";

  // An earned moment: ready to move forward AND has actually kept showing up.
  if (readiness.tier === "ready" && engagement === "healthy") return "celebrate";
  if (memory.strengths.length >= 3 && engagement === "healthy") return "celebrate";

  if (memory.last_insight) return "insight";
  return "observing";
}
