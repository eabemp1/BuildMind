/**
 * lib/reconcileFounderModels.ts
 *
 * BuildMind has two founder-modeling pipelines (FounderIntelligenceState and
 * the seven-layer BehavioralContext). They can disagree. See
 * docs/known-issue-dual-founder-modeling-systems.md, fix path 1.
 *
 * This reconciles at READ time: it compares their conclusions and returns the
 * disagreements as plain sentences, so the Founder Mirror says "these two
 * views conflict" instead of silently showing both. It does not change either
 * model.
 */

const STOP = new Set(["the", "and", "of", "to", "a", "an", "in", "for", "work", "task", "tasks"]);

function tokens(label: string): Set<string> {
  return new Set(
    label.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t)).map((t) => t.replace(/s$/, "")),
  );
}

export function sameTopic(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  for (const t of ta) if (tb.has(t)) return true;
  return false;
}

export function reconcileFounderModels(input: {
  strengths: string[];
  avoidancePatterns: string[];
  behavioralAvoidance: string[];
  behavioralStrength?: string | null;
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => { if (!seen.has(s)) { seen.add(s); out.push(s); } };

  // Behavioral view says "avoids X" while the intelligence view says "strong at X".
  for (const zone of input.behavioralAvoidance) {
    const clash = input.strengths.find((s) => sameTopic(s, zone));
    if (clash) {
      add(`Two views of you disagree: your behavior pattern flags "${zone}" as something you avoid, but your task history lists "${clash}" as a strength. Both can be true (good at it, still putting it off). Tell us which is closer.`);
    }
  }

  // Intelligence view says "avoids X" while the behavioral archetype names X as the strength.
  if (input.behavioralStrength) {
    const clash = input.avoidancePatterns.find((p) => sameTopic(p, input.behavioralStrength!));
    if (clash) {
      add(`Your archetype describes "${input.behavioralStrength}" as a strength, but your task history shows you avoiding "${clash}".`);
    }
  }

  return out.slice(0, 3);
}
