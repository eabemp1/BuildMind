/**
 * lib/server/stageReadiness.ts
 *
 * The problem this fixes: BuildMind had three real, independently correct
 * signals about whether a founder is ready to move stages —
 *   1. stage-milestone completion   (lib/server/stageProgress.ts)
 *   2. typed evidence captured      (lib/server/stageEvidence.ts)
 *   3. reflection-confidence trend  (the 3-signal check in stageTransition.ts)
 * — but nothing combined them. A founder could tick every box in a stage
 * by doing busywork, see a green "stage complete" checkmark, and the
 * system would call that "ready" — even with zero real evidence and a
 * string of low-confidence reflections. Task completion proves work
 * happened. It doesn't prove the work meant anything. Evidence and
 * reflection-conviction are what were supposed to answer that, and they
 * existed, just disconnected from the actual readiness answer shown to
 * the founder.
 *
 * This file is now the ONE place all three combine into a single, honest,
 * three-tier answer — not a binary. `lib/server/stageTransition.ts` (the
 * Today nudge) and `app/api/project/level-up/route.ts` (the on-demand
 * Projects-page check) both call this, so they can't tell two different
 * stories about the same founder's readiness.
 *
 * The tiers are deliberately not a gate — every design doc in this
 * project has been consistent that manual stage selection stays a founder
 * override regardless of tier. The point of the tier is honesty in what's
 * SHOWN, not a new restriction on what's ALLOWED.
 */

import type { StageProgress } from "@/lib/server/stageProgress";
import { getStageEvidenceRequirement, computeStageEvidenceCompleteness, type StageEvidenceType } from "@/lib/server/stageEvidence";

export type ReadinessTier = "not_ready" | "checklist_only" | "ready";

/**
 * A founder needs at least half of a transition's 4 evidence slots filled
 * to count as "meaningfully evidenced" rather than "thin." Chosen as a
 * middle ground deliberately: requiring all 4 makes the review feel like a
 * form gate (the exact friction the evidence model was designed to avoid);
 * requiring just 1 makes "evidence captured" nearly meaningless. This is a
 * product number, not a derived constant — revisit it with real usage data
 * once the tier has been live for a while, the same way the evidence pilot
 * itself was meant to evolve from real submissions rather than upfront guessing.
 */
const EVIDENCE_BAR_FRACTION = 0.5;

/** Same bar `shouldPromptStageTransition` in lib/stages/index.ts already used — kept identical on purpose so the two never disagree about what "enough reflection" means. */
const REFLECTION_MIN_COUNT = 3;
const REFLECTION_MIN_AVG_CONFIDENCE = 3.5;
const REFLECTION_MAX_OVERRIDES = 2;

export interface StageReadinessEvidence {
  filledSlots: number;
  totalSlots: number;
  meetsBar: boolean;
  missingLabels: string[];
}

export interface StageReadinessReflection {
  count: number;
  avgConfidence: number | null;
  overrides: number;
  meetsBar: boolean;
}

export interface StageReadiness {
  tier: ReadinessTier;
  currentStage: string;
  nextStage: string | null;
  stageProgress: StageProgress;
  /** null only when nextStage is null (already at the terminal stage) — every real forward transition has a requirement. */
  evidence: StageReadinessEvidence | null;
  reflection: StageReadinessReflection;
  headline: string;
  detail: string;
}

export function computeStageReadiness(input: {
  stageProgress: StageProgress;
  nextStage: string | null;
  evidenceRows: { evidence_type: StageEvidenceType }[];
  reflectionCount: number;
  avgConfidence: number | null;
  overrides: number;
}): StageReadiness {
  const { stageProgress, nextStage, evidenceRows, reflectionCount, avgConfidence, overrides } = input;
  const currentStage = stageProgress.stage;

  const reflection: StageReadinessReflection = {
    count: reflectionCount,
    avgConfidence,
    overrides,
    meetsBar:
      reflectionCount >= REFLECTION_MIN_COUNT &&
      avgConfidence !== null &&
      avgConfidence > REFLECTION_MIN_AVG_CONFIDENCE &&
      overrides < REFLECTION_MAX_OVERRIDES,
  };

  let evidence: StageReadinessEvidence | null = null;
  if (nextStage) {
    const requirement = getStageEvidenceRequirement(currentStage, nextStage);
    if (requirement) {
      const completeness = computeStageEvidenceCompleteness(requirement, evidenceRows);
      const bar = Math.ceil(requirement.slots.length * EVIDENCE_BAR_FRACTION);
      evidence = {
        filledSlots: completeness.filledSlotKeys.length,
        totalSlots: requirement.slots.length,
        meetsBar: completeness.filledSlotKeys.length >= bar,
        missingLabels: requirement.slots
          .filter(s => completeness.missingSlotKeys.includes(s.key))
          .map(s => s.label),
      };
    }
  }

  // --- Tier decision ---
  if (!stageProgress.isComplete || !nextStage) {
    return {
      tier: "not_ready",
      currentStage, nextStage, stageProgress, evidence, reflection,
      headline: `${stageProgress.completedMilestones}/${stageProgress.totalMilestones} ${currentStage} milestones done.`,
      detail: stageProgress.totalMilestones > 0
        ? "Finish the rest before this counts as a real stage transition."
        : `No milestones are tagged to ${currentStage} yet — nothing to measure.`,
    };
  }

  const evidenceOk = evidence ? evidence.meetsBar : true;
  const reflectionOk = reflection.meetsBar;

  if (evidenceOk && reflectionOk) {
    return {
      tier: "ready",
      currentStage, nextStage, stageProgress, evidence, reflection,
      headline: `Ready for ${nextStage} — milestones done, evidence captured, and your reflections back it up.`,
      detail: evidence
        ? `${evidence.filledSlots}/${evidence.totalSlots} evidence items · avg confidence ${avgConfidence}/5 over ${reflectionCount} reflections.`
        : `Avg confidence ${avgConfidence}/5 over ${reflectionCount} reflections.`,
    };
  }

  // Checklist done, but thin on evidence and/or conviction — the tier this
  // exists to surface honestly instead of silently calling it "ready."
  const gaps: string[] = [];
  if (evidence && !evidence.meetsBar) {
    gaps.push(
      `Evidence: ${evidence.filledSlots}/${evidence.totalSlots} captured — still missing ${evidence.missingLabels.slice(0, 2).join(", ")}${evidence.missingLabels.length > 2 ? ", and more" : ""}.`,
    );
  }
  if (!reflection.meetsBar) {
    if (reflection.count < REFLECTION_MIN_COUNT) {
      gaps.push(`Reflections: only ${reflection.count} in the last 7 days (need ${REFLECTION_MIN_COUNT}).`);
    } else if (reflection.avgConfidence !== null && reflection.avgConfidence <= REFLECTION_MIN_AVG_CONFIDENCE) {
      gaps.push(`Reflections: averaging ${reflection.avgConfidence}/5 confidence — a bit low to call this solid yet.`);
    } else if (reflection.overrides >= REFLECTION_MAX_OVERRIDES) {
      gaps.push(`Reflections: ${reflection.overrides} skipped/overridden checks this week.`);
    }
  }

  return {
    tier: "checklist_only",
    currentStage, nextStage, stageProgress, evidence, reflection,
    headline: `Checklist done for ${currentStage} — that's necessary, not proof.`,
    detail: gaps.join(" "),
  };
}
