/**
 * lib/today/slot.ts — the one "what changed" slot on Today.
 *
 * Pure and client-safe. The server lists what is true (candidates); the rule order below picks one.
 * No model, no scoring. A dismissed candidate stays hidden for a few days, and a quiet day shows no slot.
 */
export type SlotKind = "seed" | "back" | "market" | "risk" | "stage";

export interface SlotCandidate {
  /** Stable per fact, so dismissing "this week's market change" does not hide next week's. */
  id: string;
  kind: SlotKind;
  text: string;
  /** Absent for a plain welcome line. */
  href?: string;
  cta?: string;
}

/** Highest first. */
export const SLOT_ORDER: SlotKind[] = ["seed", "back", "market", "risk", "stage"];
export const DISMISS_DAYS = 3;
const DAY = 86_400_000;

export function pickSlot(cands: SlotCandidate[], dismissed: Record<string, string>, now: Date = new Date()): SlotCandidate | null {
  const hidden = (id: string) => {
    const at = Date.parse(dismissed[id] ?? "");
    return Number.isFinite(at) && now.getTime() - at < DISMISS_DAYS * DAY;
  };
  for (const kind of SLOT_ORDER) {
    const hit = cands.find((c) => c.kind === kind && !hidden(c.id));
    if (hit) return hit;
  }
  return null;
}

export interface StatusInputs {
  stage?: { filled: number; total: number; next: string } | null;
  pmf?: { observed: number; total: number } | null;
  pace?: { dated: number; behind: number } | null;
  rhythmWeeks?: number;
}

/** "Stage evidence 2/4 · PMF signs 1/6 · Pace: 1 behind". Only parts that are known appear. */
export function statusLine(s: StatusInputs): string {
  const parts: string[] = [];
  if (s.stage && s.stage.total > 0) parts.push(`Evidence for ${s.stage.next} ${s.stage.filled}/${s.stage.total}`);
  if (s.pmf) parts.push(`PMF signs ${s.pmf.observed}/${s.pmf.total}`);
  if (s.pace && s.pace.dated > 0) parts.push(s.pace.behind ? `Pace: ${s.pace.behind} behind` : "Pace: on track");
  if (s.rhythmWeeks && s.rhythmWeeks > 0) parts.push(`Rhythm: ${s.rhythmWeeks} ${s.rhythmWeeks === 1 ? "week" : "weeks"}`);
  return parts.join(" · ");
}

/** Drained days and quiet days show the one action and nothing else. */
export const slotAllowed = (cogLoad: "low" | "normal" | "high" | null, recoveryActive: boolean) => cogLoad !== "low" && !recoveryActive;
