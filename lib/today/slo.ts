/**
 * lib/today/slo.ts — Service-level objectives for the Today page.
 *
 * A product team does not ask "does Today feel good?"; it asks "which number
 * moved". These are the numbers, with targets, computed from counts so they are
 * trivially testable. Thresholds are deliberately in one table: changing a
 * target is a one-line, reviewable change.
 */

export interface SloCounts {
  generated: number;        // Today tasks shown
  fallbacks: number;        // guard replaced the AI task with a template
  contradictions: number;   // rejected for contradicting a founder fact
  templateLeaks: number;    // rejected for leaked template text
  completed: number;
  partial: number;
  overridden: number;
  ignored: number;
  reflected: number;        // tasks that got a reflection
  outcomeAdjusted: number;  // reflections whose outcome was corrected
  reflections: number;      // total reflections saved in the window
  loopsDue: number;         // follow-ups that came due
  loopsRecorded: number;    // follow-ups where evidence was recorded
  feedbackDoesntFit: number;
}

export type SloStatus = "ok" | "warn" | "breach" | "nodata";

export interface Slo {
  key: string;
  label: string;
  /** Percentage 0-100, or null when there is not enough data. */
  value: number | null;
  target: number;
  direction: "max" | "min";
  status: SloStatus;
  detail: string;
}

/** Below this many events a rate is noise, not signal. */
export const MIN_SAMPLE = 5;

interface Def {
  key: string;
  label: string;
  target: number;
  direction: "max" | "min";
  num: (c: SloCounts) => number;
  den: (c: SloCounts) => number;
  detail: (c: SloCounts) => string;
}

export const SLO_DEFS: Def[] = [
  { key: "fallback", label: "Template fallback rate", target: 10, direction: "max", num: (c) => c.fallbacks, den: (c) => c.generated, detail: (c) => `${c.fallbacks} of ${c.generated} tasks were replaced by a template` },
  { key: "contradiction", label: "Fact-contradiction rate", target: 5, direction: "max", num: (c) => c.contradictions, den: (c) => c.generated, detail: (c) => `${c.contradictions} generated tasks contradicted something the founder said` },
  { key: "leak", label: "Template-leak rate", target: 1, direction: "max", num: (c) => c.templateLeaks, den: (c) => c.generated, detail: (c) => `${c.templateLeaks} tasks leaked placeholder text` },
  { key: "traction", label: "Task traction (done or partial)", target: 40, direction: "min", num: (c) => c.completed + c.partial, den: (c) => c.completed + c.partial + c.overridden + c.ignored, detail: (c) => `${c.completed + c.partial} of ${c.completed + c.partial + c.overridden + c.ignored} resolved tasks got traction` },
  { key: "reflection", label: "Reflection rate", target: 40, direction: "min", num: (c) => c.reflected, den: (c) => c.generated, detail: (c) => `${c.reflected} of ${c.generated} tasks got a reflection` },
  { key: "loops", label: "Follow-ups closed", target: 50, direction: "min", num: (c) => c.loopsRecorded, den: (c) => c.loopsDue, detail: (c) => `${c.loopsRecorded} of ${c.loopsDue} due follow-ups got evidence` },
  { key: "adjusted", label: "Outcome corrections", target: 15, direction: "max", num: (c) => c.outcomeAdjusted, den: (c) => c.reflections, detail: (c) => `${c.outcomeAdjusted} of ${c.reflections} reflections had their outcome corrected` },
  { key: "doesntfit", label: "\"Doesn't fit me\" rate", target: 15, direction: "max", num: (c) => c.feedbackDoesntFit, den: (c) => c.generated, detail: (c) => `${c.feedbackDoesntFit} of ${c.generated} tasks were marked as not fitting` },
];

export function statusFor(value: number, target: number, direction: "max" | "min"): SloStatus {
  if (direction === "max") {
    if (value <= target) return "ok";
    return value <= target * 1.5 ? "warn" : "breach";
  }
  if (value >= target) return "ok";
  return value >= target * 0.75 ? "warn" : "breach";
}

export function computeSlos(c: SloCounts): Slo[] {
  return SLO_DEFS.map((d) => {
    const den = d.den(c);
    if (den < MIN_SAMPLE) {
      return { key: d.key, label: d.label, value: null, target: d.target, direction: d.direction, status: "nodata" as const, detail: `Only ${den} data point${den === 1 ? "" : "s"} so far` };
    }
    const value = Math.round((d.num(c) / den) * 1000) / 10;
    return { key: d.key, label: d.label, value, target: d.target, direction: d.direction, status: statusFor(value, d.target, d.direction), detail: d.detail(c) };
  });
}

export function overallStatus(slos: Slo[]): SloStatus {
  const real = slos.filter((s) => s.status !== "nodata");
  if (!real.length) return "nodata";
  if (real.some((s) => s.status === "breach")) return "breach";
  if (real.some((s) => s.status === "warn")) return "warn";
  return "ok";
}
