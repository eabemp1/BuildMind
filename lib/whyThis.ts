/**
 * lib/whyThis.ts
 *
 * Turns what the Today recommendation already carries (signals, alternatives,
 * confidence, reflection use, fallback status) into a plain-language
 * explanation for the "Why am I seeing this?" panel. Pure and honest: it only
 * reports what is actually present and says so when something is missing.
 */

export type WhyThisInput = {
  isAI?: boolean;
  isLowConfidence?: boolean;
  reflexion?: { lastReflectionUsed?: boolean; wasHardFallback?: boolean; hardFallbackReasons?: string[]; passedCritic?: boolean } | null;
  intelligence?: {
    top_signals?: Array<{ title: string; summary: string; confidence: number; evidence?: Array<{ source: string; detail: string }> }>;
    decision?: {
      top_candidate?: { expected_evidence?: string; scores?: { total: number; confidence?: number } } | null;
      alternatives?: Array<{ action: string; why_it_beats_alternatives: string }>;
    };
    founder_model?: { confidence: number; avoidance_patterns?: string[] };
  } | null;
};

export type WhyThisModel = {
  confidence: { level: "high" | "medium" | "low" | "unknown"; label: string };
  reasons: string[];
  signals: Array<{ title: string; detail: string }>;
  alternatives: Array<{ action: string; why: string }>;
  usedReflection: boolean | null;
  fallbackNote: string | null;
  mirrorLink: string;
};

export function buildWhyThis(input: WhyThisInput): WhyThisModel {
  const intel = input.intelligence ?? null;
  const top = intel?.decision?.top_candidate ?? null;
  const conf = top?.scores?.confidence;

  let confidence: WhyThisModel["confidence"];
  if (typeof conf !== "number") confidence = { level: "unknown", label: "Not enough data to rate" };
  else if (input.isLowConfidence || conf < 40) confidence = { level: "low", label: `Low (${Math.round(conf)}%). Treat this as a small test, not a firm call.` };
  else if (conf < 70) confidence = { level: "medium", label: `Medium (${Math.round(conf)}%)` };
  else confidence = { level: "high", label: `High (${Math.round(conf)}%)` };

  const signals = (intel?.top_signals ?? []).slice(0, 3).map((s) => ({
    title: s.title,
    detail: s.evidence?.[0] ? `${s.summary} (${s.evidence[0].source}: ${s.evidence[0].detail})` : s.summary,
  }));

  const reasons: string[] = [];
  if (signals.length) reasons.push(`${signals.length} signal${signals.length === 1 ? "" : "s"} from your recent activity point here.`);
  if (top?.expected_evidence) reasons.push(`It should produce this evidence: ${top.expected_evidence}`);
  if (intel?.founder_model?.avoidance_patterns?.length) reasons.push(`It accounts for a pattern in how you work: ${intel.founder_model.avoidance_patterns[0]}.`);
  if (!reasons.length) reasons.push("Based on your project's stage and what you've told BuildMind so far.");

  const alternatives = (intel?.decision?.alternatives ?? []).slice(0, 3).map((a) => ({ action: a.action, why: a.why_it_beats_alternatives }));

  const usedReflection = input.reflexion ? Boolean(input.reflexion.lastReflectionUsed) : null;

  let fallbackNote: string | null = null;
  if (input.reflexion?.wasHardFallback) {
    fallbackNote = "The AI's first draft failed our quality check, so this is a safe built-in task for your stage.";
  } else if (input.isAI === false) {
    fallbackNote = "The AI couldn't run just now, so this is a built-in task for your stage.";
  }

  return { confidence, reasons, signals, alternatives, usedReflection, fallbackNote, mirrorLink: "/founder-mirror" };
}
