/**
 * lib/mirrorMoment.ts — Layer 6: The Mirror Moment
 *
 * The "I could not have seen that about myself" experience.
 * This is the retention mechanism and the word-of-mouth hook.
 *
 * Milestones:
 *   After 3 check-ins  → First behavioral insight: a named pattern, not a score
 *   After 7 days       → Behavioral signature card (shareable, specific, slightly uncomfortable)
 *   After 30 days      → Full pattern report (avoidance zones named, peak windows, confidence gap)
 *
 * All output uses the data computed by Layers 1–4.
 * The AI call (if needed) is minimal — the hard work is done deterministically.
 *
 * The goal: say things the founder has never said out loud about themselves
 * but immediately recognises as true.
 */

import type { TemporalProfile } from "@/lib/temporalPatterns";
import type { LinguisticProfile } from "@/lib/linguisticSignals";
import type { ExecutionSignature } from "@/lib/outcomeCorrelation";
import type { ExternalAnchorReport } from "@/lib/externalAnchors";

// ── Founder archetype taxonomy ────────────────────────────────────────────────
// Each archetype has a name, a strength, and a characteristic blind spot.
// The system picks the one that best fits the evidence.

export interface FounderArchetype {
  id: string;
  name: string;
  tagline: string;         // 1-line sharp description
  strength: string;
  blindSpot: string;
  shadowBehavior: string;  // what they do when avoiding the blind spot
}

const ARCHETYPES: FounderArchetype[] = [
  {
    id: "executor_hider",
    name: "The Executor Who Hides",
    tagline: "You ship fast and hide.",
    strength: "Technical execution — you build faster than almost anyone.",
    blindSpot: "Distribution. You treat shipping as finishing.",
    shadowBehavior: "When uncomfortable, you open the code editor.",
  },
  {
    id: "researcher_avoider",
    name: "The Researcher Who Won't Decide",
    tagline: "You know everything except what to do next.",
    strength: "Deep understanding of your problem space and users.",
    blindSpot: "Commitment. Research becomes a permanent holding pattern.",
    shadowBehavior: "When it's time to ship, you do one more interview.",
  },
  {
    id: "connector_builder",
    name: "The Connector Who Can't Build",
    tagline: "You have the relationships. You're waiting on the product.",
    strength: "Outreach and user relationships — people respond to you.",
    blindSpot: "Execution. You know what to build but struggle to ship it.",
    shadowBehavior: "When the product stalls, you schedule another call.",
  },
  {
    id: "writer_avoider",
    name: "The Storyteller Who Won't Ship",
    tagline: "Perfect narrative. No product behind it yet.",
    strength: "Content, positioning, and narrative clarity.",
    blindSpot: "Technical execution and talking to users directly.",
    shadowBehavior: "When stuck, you rewrite the landing page.",
  },
  {
    id: "overconfident_underdeliverer",
    name: "The Optimist With a Calibration Problem",
    tagline: "Your confidence score is a mood signal, not an execution signal.",
    strength: "Energy, conviction, and ability to sell the vision.",
    blindSpot: "Accurate self-assessment. Your confidence outruns your output.",
    shadowBehavior: "When behind, you set a new ambitious goal instead of examining the gap.",
  },
  {
    id: "consistent_low_momentum",
    name: "The Steady Drifter",
    tagline: "You show up every day and move very slowly.",
    strength: "Consistency and discipline — you don't quit.",
    blindSpot: "Urgency. Showing up is not the same as executing.",
    shadowBehavior: "When results aren't coming, you add more structure instead of more output.",
  },
];

// ── Archetype selection ────────────────────────────────────────────────────────

interface ArchetypeInputs {
  temporal: TemporalProfile;
  linguistic: LinguisticProfile;
  execution: ExecutionSignature;
  anchors: ExternalAnchorReport;
  checkinsTotal: number;
  daysSinceStart: number;
}

export function selectArchetype(inputs: ArchetypeInputs): FounderArchetype {
  const scores: Record<string, number> = {};
  for (const a of ARCHETYPES) scores[a.id] = 0;

  const { execution, linguistic, temporal, anchors } = inputs;

  // executor_hider: strong technical, weak outreach, user conversation gap
  const techStrength = execution.strengths.find((s) => s.category === "technical");
  const outreachAvoid = execution.avoidanceZones.find((s) => s.category === "outreach");
  if (techStrength) scores["executor_hider"] += 2;
  if (outreachAvoid) scores["executor_hider"] += 2;
  if ((anchors.daysSinceUserConversation ?? 0) >= 7) scores["executor_hider"] += 2;
  if (anchors.busyworkCategory === "technical") scores["executor_hider"] += 2;

  // researcher_avoider: high research completion, low shipping, long sessions, vocabulary repetition
  const researchStrength = execution.strengths.find((s) => s.category === "research");
  const technicalAvoid = execution.avoidanceZones.find((s) => s.category === "technical");
  if (researchStrength) scores["researcher_avoider"] += 2;
  if (technicalAvoid) scores["researcher_avoider"] += 2;
  if (linguistic.repeatedVocab.length >= 3) scores["researcher_avoider"] += 1;

  // connector_builder: strong outreach/talk, low technical
  const outreachStrength = execution.strengths.find((s) => s.category === "outreach");
  if (outreachStrength) scores["connector_builder"] += 2;
  if (technicalAvoid) scores["connector_builder"] += 2;

  // writer_avoider: strong content, low outreach + technical
  const contentStrength = execution.strengths.find((s) => s.category === "content");
  if (contentStrength) scores["writer_avoider"] += 2;
  if (outreachAvoid && technicalAvoid) scores["writer_avoider"] += 2;
  if (anchors.busyworkCategory === "content") scores["writer_avoider"] += 2;

  // overconfident_underdeliverer: confidence calibration gap
  if (linguistic.confidenceCalibrationGap !== null && linguistic.confidenceCalibrationGap > 0.3) {
    scores["overconfident_underdeliverer"] += 4;
  }

  // consistent_low_momentum: shrinking sessions, fragile streak, sentiment declining
  if (temporal.sessionLengthTrend === "shrinking") scores["consistent_low_momentum"] += 2;
  if (temporal.streakFragility === "fragile") scores["consistent_low_momentum"] += 2;
  if (linguistic.sentimentTrajectory === "declining") scores["consistent_low_momentum"] += 1;

  const topId = Object.entries(scores).sort(([, a], [, b]) => b - a)[0][0];
  return ARCHETYPES.find((a) => a.id === topId) ?? ARCHETYPES[0];
}

// ── Milestone 1: First behavioral insight (after 3 check-ins) ─────────────────

export interface FirstInsight {
  archetype: FounderArchetype;
  observation: string;    // the "uncomfortably accurate" sentence
  prompt: string;         // the follow-up question to reflect on
}

export function generateFirstInsight(inputs: ArchetypeInputs): FirstInsight | null {
  if (inputs.checkinsTotal < 3) return null;

  const archetype = selectArchetype(inputs);
  const { linguistic, execution, temporal } = inputs;

  // Build an observation using the strongest signal available
  let observation = archetype.tagline;

  if (execution.signatureSentence) {
    observation = execution.signatureSentence;
  } else if (linguistic.signals.length > 0 && linguistic.signals[0].severity === "high") {
    observation = linguistic.signals[0].message.split(".")[0] + ".";
  } else if (temporal.insight) {
    observation = temporal.insight.split(".")[0] + ".";
  }

  const prompt = getArchetypePrompt(archetype.id);

  return { archetype, observation, prompt };
}

function getArchetypePrompt(archetypeId: string): string {
  const prompts: Record<string, string> = {
    executor_hider:
      "When did you last have a conversation that made you uncomfortable about whether you're building the right thing?",
    researcher_avoider:
      "What is the one decision you've been researching instead of making?",
    connector_builder:
      "What's the smallest possible version of your product you could put in front of someone this week?",
    writer_avoider:
      "What would you have to ship in order to make the story true?",
    overconfident_underdeliverer:
      "What did you predict last week that didn't happen, and what did you tell yourself about it?",
    consistent_low_momentum:
      "What would it look like to work with 20% more urgency this week — not more hours, more urgency?",
  };
  return prompts[archetypeId] ?? "What's the thing you already know but haven't named yet?";
}

// ── Milestone 2: 7-day signature card (shareable) ─────────────────────────────

export interface SignatureCard {
  founderName: string | null;
  dayCount: number;
  archetypeName: string;
  archetypeTagline: string;
  statLine: string;           // e.g. "Completed 5/7 tasks. Last user conversation: 9 days ago."
  avoidanceZone: string | null;
  peakHour: string | null;
  shareText: string;          // ready-to-share text
}

export function generateSignatureCard(params: {
  founderName: string | null;
  dayCount: number;
  inputs: ArchetypeInputs;
}): SignatureCard | null {
  if (params.dayCount < 7) return null;

  const { inputs, founderName, dayCount } = params;
  const archetype = selectArchetype(inputs);
  const { execution, temporal, anchors } = inputs;

  const avoidanceZone =
    execution.avoidanceZones.length > 0 ? execution.avoidanceZones[0].category : null;

  const peakHour =
    temporal.peakProductivityHour !== null
      ? formatHour(temporal.peakProductivityHour)
      : null;

  const statParts: string[] = [];
  if (execution.signatureSentence) statParts.push(execution.signatureSentence);
  if (anchors.daysSinceUserConversation !== null) {
    statParts.push(`Last user conversation: ${anchors.daysSinceUserConversation} days ago.`);
  }
  const statLine = statParts.join(" ");

  const name = founderName?.split(" ")[0] ?? "Founder";
  const shareText =
    `Day ${dayCount} pattern — ${name}: ${archetype.tagline} ` +
    (avoidanceZone ? `Avoidance zone: ${avoidanceZone}. ` : "") +
    (statLine ? statLine + " " : "") +
    `Built with BuildMind.`;

  return {
    founderName,
    dayCount,
    archetypeName: archetype.name,
    archetypeTagline: archetype.tagline,
    statLine,
    avoidanceZone,
    peakHour,
    shareText,
  };
}

// ── Milestone 3: 30-day pattern report ────────────────────────────────────────

export interface PatternReport {
  founderName: string | null;
  archetype: FounderArchetype;
  executiveSummary: string;     // 2–3 sentences. The thing they've never said out loud.
  avoidanceZones: string[];
  executionStrengths: string[];
  peakExecutionWindow: string | null;
  confidenceCalibration: string | null;
  topBlocker: string | null;
  sentimentTrajectory: string;
  recommendedFocus: string;     // the one thing they should change
  sections: ReportSection[];
}

export interface ReportSection {
  title: string;
  content: string;
}

export function generatePatternReport(params: {
  founderName: string | null;
  dayCount: number;
  inputs: ArchetypeInputs;
}): PatternReport | null {
  if (params.dayCount < 30) return null;

  const { inputs, founderName } = params;
  const { temporal, linguistic, execution, anchors } = inputs;
  const archetype = selectArchetype(inputs);

  const name = founderName?.split(" ")[0] ?? "you";

  // ── Executive summary — the uncomfortable truth ──────────────────────────
  const avoidanceNames = execution.avoidanceZones.map((z) => z.category);
  const strengthNames = execution.strengths.map((z) => z.category);

  let executiveSummary = `${archetype.tagline} `;
  if (avoidanceNames.length > 0 && strengthNames.length > 0) {
    executiveSummary += `${name === "you" ? "You" : founderName} excel at ${strengthNames[0]} work and systematically avoid ${avoidanceNames[0]}. `;
  }
  if (linguistic.confidenceCalibrationGap && linguistic.confidenceCalibrationGap > 0.2) {
    const gapPct = Math.round(linguistic.confidenceCalibrationGap * 100);
    executiveSummary += `Your confidence consistently runs ${gapPct}% ahead of your actual completion rate.`;
  } else if (temporal.streakFragility === "fragile") {
    executiveSummary += `You show up consistently but complete tasks inconsistently — presence without execution.`;
  }

  // ── Peak execution window ────────────────────────────────────────────────
  const peakExecutionWindow =
    temporal.peakProductivityHour !== null
      ? `${formatHour(temporal.peakProductivityHour)} — ${formatHour((temporal.peakProductivityHour + 2) % 24)}`
      : null;

  // ── Confidence calibration note ──────────────────────────────────────────
  let confidenceCalibration: string | null = null;
  if (linguistic.confidenceCalibrationGap !== null) {
    const gap = linguistic.confidenceCalibrationGap;
    if (gap > 0.3) {
      confidenceCalibration = `You rate your confidence ${Math.round(gap * 100)}% higher than your completion rate on average. Your confidence is a mood measurement, not a prediction.`;
    } else if (gap < -0.2) {
      confidenceCalibration = `You consistently underestimate yourself — your completion rate is higher than your stated confidence. You're capable of more than you believe.`;
    }
  }

  // ── Top blocker ──────────────────────────────────────────────────────────
  const topBlocker =
    linguistic.blockerClusters.length > 0 ? linguistic.blockerClusters[0].theme : null;

  // ── Recommended focus ────────────────────────────────────────────────────
  const recommendedFocus = buildRecommendedFocus(archetype, execution, anchors);

  // ── Sections ─────────────────────────────────────────────────────────────
  const sections: ReportSection[] = [];

  sections.push({
    title: "Execution Signature",
    content: execution.signatureSentence ?? `Insufficient task data to compute a signature yet.`,
  });

  if (temporal.insight) {
    sections.push({
      title: "When You Work",
      content: temporal.insight,
    });
  }

  if (linguistic.signals.length > 0) {
    sections.push({
      title: "What Your Language Reveals",
      content: linguistic.signals
        .slice(0, 2)
        .map((s) => s.message)
        .join("\n\n"),
    });
  }

  if (anchors.alerts.length > 0) {
    sections.push({
      title: "Reality Check",
      content: anchors.alerts
        .slice(0, 2)
        .map((a) => a.message)
        .join("\n\n"),
    });
  }

  sections.push({
    title: "The One Change",
    content: recommendedFocus,
  });

  return {
    founderName,
    archetype,
    executiveSummary,
    avoidanceZones: avoidanceNames,
    executionStrengths: strengthNames,
    peakExecutionWindow,
    confidenceCalibration,
    topBlocker,
    sentimentTrajectory: linguistic.sentimentTrajectory,
    recommendedFocus,
    sections,
  };
}

function buildRecommendedFocus(
  archetype: FounderArchetype,
  execution: ExecutionSignature,
  anchors: ExternalAnchorReport,
): string {
  if ((anchors.daysSinceUserConversation ?? 0) >= 14) {
    return "Schedule one user conversation this week. Not a demo — a conversation. Ask one question and listen. Everything else is secondary.";
  }
  if (archetype.id === "executor_hider") {
    return "For the next two weeks, cap technical work at 2 hours per day. Use the rest for outreach and user conversations. The product is not the bottleneck.";
  }
  if (archetype.id === "researcher_avoider") {
    return "Pick the one decision you've been researching and make it by end of this week. Write down the decision and your reasoning. Stop gathering data.";
  }
  if (execution.avoidanceZones.length > 0) {
    const zone = execution.avoidanceZones[0].category;
    return `You avoid ${zone} tasks. For the next 7 days, start each day with a ${zone} task before anything else. Your avoidance zone is where your leverage is.`;
  }
  return archetype.blindSpot
    ? `Your core blind spot is: ${archetype.blindSpot} Focus everything on closing that gap this month.`
    : "Keep shipping. The pattern is working — don't add complexity.";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatHour(h: number): string {
  const ampm = h < 12 ? "am" : "pm";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${ampm}`;
}

/**
 * getMirrorMomentMilestone — returns which milestone the founder is at,
 * or null if none triggered yet.
 */
export function getMirrorMomentMilestone(
  checkinsTotal: number,
  daysSinceStart: number,
): "first_insight" | "signature_card" | "pattern_report" | null {
  if (daysSinceStart >= 30) return "pattern_report";
  if (daysSinceStart >= 7) return "signature_card";
  if (checkinsTotal >= 3) return "first_insight";
  return null;
}

/**
 * buildMirrorPromptBlock — inject the most relevant mirror insight
 * into the AI morning briefing prompt. The AI should reference this
 * naturally, not robotically list it.
 */
export function buildMirrorPromptBlock(
  firstInsight: FirstInsight | null,
  signatureCard: SignatureCard | null,
): string {
  if (signatureCard) {
    return [
      "FOUNDER BEHAVIORAL SIGNATURE (7-day):",
      `Archetype: ${signatureCard.archetypeName} — ${signatureCard.archetypeTagline}`,
      signatureCard.avoidanceZone
        ? `Documented avoidance zone: ${signatureCard.avoidanceZone}`
        : "",
      signatureCard.statLine,
      "Reference this naturally in your response. Do not list it — use it to explain why today's task matters for THIS founder.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (firstInsight) {
    return [
      "FIRST BEHAVIORAL OBSERVATION (3 check-ins):",
      firstInsight.observation,
      `Archetype emerging: ${firstInsight.archetype.name}`,
      "If relevant, reflect this observation back to the founder — name the pattern, don't just describe it.",
    ].join("\n");
  }

  return "";
}
