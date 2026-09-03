/**
 * lib/server/stageEvidence.ts
 *
 * Decision 1 (what counts as evidence) and Decision 2 (which transitions
 * get real exit criteria), implemented together:
 *
 * Decision 1 — a CLOSED set of 4 evidence types, not an open schema and not
 * bare free text. Rigorous enough to be queryable (a metric has a
 * name/value/date, not just a sentence), cheap enough that a founder can
 * fill one in on a Tuesday night without hitting a form with a dozen
 * fields. Every evidence row must be exactly one of: metric | artifact |
 * experiment | founder_judgment. This is enforced at the database layer
 * too (see the CHECK constraints in
 * 20260902020000_stage_transition_evidence.sql) — this file is not the
 * only place the closed set is honored.
 *
 * Decision 2 — ALL FIVE forward transitions are fully built, not just
 * Launch -> Growth. STAGE_EVIDENCE_REQUIREMENTS has an entry for every
 * stage a founder can move INTO going forward: Validation, MVP, Launch,
 * Growth, Revenue. (Idea has no entry because nothing precedes it — you
 * can't "transition into" the starting stage.) Each entry was designed
 * with the same rigor as the original Launch -> Growth build: 4 slots that
 * reflect what actually changes about the business at that specific
 * transition, not a generic reused template.
 *
 * getStageEvidenceRequirement is keyed by TARGET stage only, not by the
 * exact (from, to) pair. A founder can skip stages in the picker (e.g.
 * Idea straight to MVP); the requirement for arriving AT a stage doesn't
 * depend on which stage they skipped from, so this looks up by
 * destination. It returns null for any transition that isn't a forward
 * move (toIdx <= fromIdx) — moving a stage backward is a correction, not a
 * transition, and stays an unreviewed override exactly as
 * stage-transition-product-design.md specifies for manual selection in
 * general.
 */

import { STAGE_ORDER } from "@/lib/stages";

export type StageEvidenceType = "metric" | "artifact" | "experiment" | "founder_judgment";

export const STAGE_EVIDENCE_TYPES: readonly StageEvidenceType[] = [
  "metric",
  "artifact",
  "experiment",
  "founder_judgment",
] as const;

export interface StageEvidenceRow {
  id: string;
  evidence_type: StageEvidenceType;
  metric_name: string | null;
  metric_value: string | null;
  metric_date: string | null;
  artifact_description: string | null;
  artifact_url: string | null;
  experiment_channel: string | null;
  experiment_hypothesis: string | null;
  experiment_outcome: string | null;
  judgment_text: string | null;
  created_at: string;
}

/** One evidence slot a transition review wants filled. */
export interface StageEvidenceSlot {
  key: string;
  label: string;
  helpText: string;
  /** Which evidence type(s) can satisfy this slot. */
  acceptedTypes: readonly StageEvidenceType[];
}

export interface StageEvidenceRequirement {
  /** The target stage this requirement applies to (see file header — keyed by target, not by pair). */
  toStage: string;
  /** Shown above the evidence form so the ask is explained, not just a checklist. */
  framing: string;
  slots: readonly StageEvidenceSlot[];
}

// Decision 2: one entry per stage a founder can move INTO. Fully built for
// all five, not a subset. Each was designed around what that specific
// transition actually needs to prove, not copied from Launch -> Growth.
const STAGE_EVIDENCE_REQUIREMENTS: Record<string, StageEvidenceRequirement> = {
  Validation: {
    toStage: "Validation",
    framing:
      "Validation means the problem is real for someone other than you. A task count doesn't prove that — talk to people and bring back what they actually said.",
    slots: [
      {
        key: "problem_evidence",
        label: "Evidence the problem is real",
        helpText: "Notes, quotes, or a summary from real conversations with people who have this problem — not assumptions about what they'd want.",
        acceptedTypes: ["artifact"],
      },
      {
        key: "target_user_defined",
        label: "Who specifically has this problem",
        helpText: "Name the first users precisely enough that you could go find 10 more just like them.",
        acceptedTypes: ["founder_judgment"],
      },
      {
        key: "demand_signal",
        label: "A demand signal beyond a compliment",
        helpText: "A waitlist signup, a pre-order, a letter of intent, or someone actually asking to pay or switch — not \"that's a great idea.\"",
        acceptedTypes: ["metric", "artifact"],
      },
      {
        key: "validation_confirmation",
        label: "Founder confirms this is worth building",
        helpText: "In your own words: why does the evidence above justify starting to build, rather than researching further?",
        acceptedTypes: ["founder_judgment"],
      },
    ],
  },

  MVP: {
    toStage: "MVP",
    framing:
      "MVP is a build commitment, not another research phase. Before this moves, be specific about what you're building and why it's the smallest thing that tests the real risk.",
    slots: [
      {
        key: "solution_hypothesis",
        label: "The specific solution, and why",
        helpText: "What you're building and why it's the right response to the validated problem — the actual bet, not a feature list.",
        acceptedTypes: ["founder_judgment"],
      },
      {
        key: "mvp_scope",
        label: "MVP scope defined",
        helpText: "A real spec, wireframe, or feature list for the smallest version that tests the hypothesis.",
        acceptedTypes: ["artifact"],
      },
      {
        key: "build_plan",
        label: "A build/test plan you're actually running",
        helpText: "What you're building, how you'll know if it worked, and by when.",
        acceptedTypes: ["experiment"],
      },
      {
        key: "mvp_confirmation",
        label: "Founder confirms this is buildable now",
        helpText: "Why is now the right time to start building, instead of validating further?",
        acceptedTypes: ["founder_judgment"],
      },
    ],
  },

  Launch: {
    toStage: "Launch",
    framing:
      "Launch means the product actually works and is about to go in front of the public. Prove the thing works before you try to prove it grows.",
    slots: [
      {
        key: "product_functional",
        label: "MVP functions end-to-end",
        helpText: "A demo, a working link, or screenshots showing the core flow actually works — not just individual pieces in isolation.",
        acceptedTypes: ["artifact"],
      },
      {
        key: "beta_feedback",
        label: "Feedback from real, non-founder users",
        helpText: "What early or beta users actually said or did — not friends being polite.",
        acceptedTypes: ["metric", "artifact"],
      },
      {
        key: "launch_readiness_check",
        label: "A launch dry run",
        helpText: "A soft launch, closed beta, or dry run you actually attempted, and what happened.",
        acceptedTypes: ["experiment"],
      },
      {
        key: "launch_confirmation",
        label: "Founder confirms it's ready for the public",
        helpText: "What convinces you this is ready for real strangers, not just people you know personally?",
        acceptedTypes: ["founder_judgment"],
      },
    ],
  },

  Growth: {
    toStage: "Growth",
    framing:
      "Growth is a different operating problem than Launch. Before this project moves, capture what actually changed — a generic task count isn't proof the business did.",
    slots: [
      {
        key: "real_user_exposure",
        label: "Real user exposure",
        helpText: "The product was used by real users outside the founder — a link, a signup list, a support thread, a usage screenshot.",
        acceptedTypes: ["artifact", "metric"],
      },
      {
        key: "channel_attempt",
        label: "Acquisition channel or experiment attempted",
        helpText: "A specific channel or growth experiment you actually ran, with what you expected and what happened.",
        acceptedTypes: ["experiment"],
      },
      {
        key: "measurable_result",
        label: "Measurable result",
        helpText: "Signups, activation, retention, conversion, or revenue — a real number with a date, not an estimate.",
        acceptedTypes: ["metric"],
      },
      {
        key: "growth_confirmation",
        label: "Founder confirms growth is the problem now",
        helpText: "In your own words: why is distribution/growth the constraint now, not launch readiness?",
        acceptedTypes: ["founder_judgment"],
      },
    ],
  },

  Revenue: {
    toStage: "Revenue",
    framing:
      "Revenue means someone is paying, not just using. Growth metrics without payment evidence don't yet prove the business works.",
    slots: [
      {
        key: "traction_metric",
        label: "Real growth traction",
        helpText: "An actual number — active users, MRR trajectory, or a growth rate — with a date, not an estimate.",
        acceptedTypes: ["metric"],
      },
      {
        key: "monetization_attempt",
        label: "A monetization or pricing experiment",
        helpText: "A pricing model or paywall you actually tried, and what happened when you asked people to pay.",
        acceptedTypes: ["experiment"],
      },
      {
        key: "paying_customer_evidence",
        label: "Evidence someone actually paid",
        helpText: "A real transaction, invoice, or subscription — not a stated willingness to pay.",
        acceptedTypes: ["metric", "artifact"],
      },
      {
        key: "revenue_confirmation",
        label: "Founder confirms revenue is the focus now",
        helpText: "Why is monetization the operating problem now, rather than growth?",
        acceptedTypes: ["founder_judgment"],
      },
    ],
  },
};

/**
 * Returns the requirement for arriving at `toStage`, or null when the move
 * isn't a forward transition (backward moves and no-ops are unreviewed
 * overrides — see file header). `fromStage` is accepted for that forward
 * check and for API/display symmetry with the (from, to) pair the caller
 * already has, even though the requirement itself is keyed by target only.
 */
export function getStageEvidenceRequirement(fromStage: string, toStage: string): StageEvidenceRequirement | null {
  const fromIdx = STAGE_ORDER.indexOf(fromStage as typeof STAGE_ORDER[number]);
  const toIdx = STAGE_ORDER.indexOf(toStage as typeof STAGE_ORDER[number]);
  if (fromIdx < 0 || toIdx < 0 || toIdx <= fromIdx) return null;
  return STAGE_EVIDENCE_REQUIREMENTS[toStage] ?? null;
}

export interface StageEvidenceCompleteness {
  requirement: StageEvidenceRequirement;
  filledSlotKeys: string[];
  missingSlotKeys: string[];
  isComplete: boolean;
}

/**
 * A slot is filled if at least one submitted row's type matches one of the
 * slot's accepted types. This is intentionally lenient about which specific
 * row satisfies which slot — founders shouldn't have to tag evidence
 * against a slot ID, the type alone is enough signal.
 */
export function computeStageEvidenceCompleteness(
  requirement: StageEvidenceRequirement,
  rows: Pick<StageEvidenceRow, "evidence_type">[],
): StageEvidenceCompleteness {
  const submittedTypes = new Set(rows.map(r => r.evidence_type));
  const filledSlotKeys: string[] = [];
  const missingSlotKeys: string[] = [];
  for (const slot of requirement.slots) {
    const filled = slot.acceptedTypes.some(t => submittedTypes.has(t));
    (filled ? filledSlotKeys : missingSlotKeys).push(slot.key);
  }
  return {
    requirement,
    filledSlotKeys,
    missingSlotKeys,
    isComplete: missingSlotKeys.length === 0,
  };
}

/** Server-side validation that a submitted row is internally consistent for its type. */
export function validateStageEvidenceInput(input: {
  evidence_type: string;
  metric_name?: string | null;
  metric_value?: string | null;
  artifact_description?: string | null;
  experiment_channel?: string | null;
  experiment_outcome?: string | null;
  judgment_text?: string | null;
}): string | null {
  if (!STAGE_EVIDENCE_TYPES.includes(input.evidence_type as StageEvidenceType)) {
    return `evidence_type must be one of: ${STAGE_EVIDENCE_TYPES.join(", ")}`;
  }
  switch (input.evidence_type as StageEvidenceType) {
    case "metric":
      if (!input.metric_name?.trim() || !input.metric_value?.trim()) return "metric evidence requires metric_name and metric_value";
      break;
    case "artifact":
      if (!input.artifact_description?.trim()) return "artifact evidence requires artifact_description";
      break;
    case "experiment":
      if (!input.experiment_channel?.trim() || !input.experiment_outcome?.trim()) return "experiment evidence requires experiment_channel and experiment_outcome";
      break;
    case "founder_judgment":
      if (!input.judgment_text?.trim()) return "founder_judgment evidence requires judgment_text";
      break;
  }
  return null;
}
