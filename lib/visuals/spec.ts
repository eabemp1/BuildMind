/**
 * lib/visuals/spec.ts
 *
 * A visual is DATA, never model-written markup. Builders turn real founder
 * data into a VisualSpec; one renderer (components/visuals/VisualBoard.tsx)
 * draws it in the coach, in the side pane, and in the exported report, so a
 * number can never differ between the three. Client-safe: no server imports.
 */

export type VisualTone = "good" | "warn" | "bad" | "accent" | "neutral";

export type VisualPanel =
  | { type: "stats"; title?: string; items: Array<{ label: string; value: string; sub?: string; tone?: VisualTone }> }
  | { type: "gauge"; title: string; value: number; max?: number; label?: string; caption?: string; tone?: VisualTone }
  | { type: "bars"; title: string; caption?: string; unit?: string; items: Array<{ label: string; value: number; max?: number; tone?: VisualTone; note?: string }> }
  | { type: "line"; title: string; caption?: string; unit?: string; min?: number; max?: number; points: Array<{ label: string; value: number }> }
  | { type: "radar"; title: string; caption?: string; axes: Array<{ label: string; value: number; max?: number }> }
  | { type: "heat"; title: string; caption?: string; columns?: number; cells: Array<{ label: string; value: number; note?: string }> }
  | { type: "signals"; title: string; caption?: string; items: Array<{ label: string; severity: "low" | "medium" | "high" | "critical"; confidence?: number; note?: string }> }
  | { type: "tree"; title: string; caption?: string; root: string; branches: Array<{ label: string; tone?: VisualTone; note?: string; children?: Array<{ label: string; note?: string }> }> }
  | { type: "callout"; title?: string; text: string; tone?: VisualTone };

export interface VisualSpec {
  title: string;
  subtitle?: string;
  generatedAt?: string;
  panels: VisualPanel[];
}

export const clampNum = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

/** Tone for a 0-100 "higher is better" value. */
export function toneForScore(v: number): VisualTone {
  return v >= 70 ? "good" : v >= 40 ? "warn" : "bad";
}
