/**
 * lib/today/evening.ts — the evening close-out.
 *
 * Four quick taps replace the old one-liner: what happened to today's task,
 * what got in the way, one line of what happened, and tomorrow's first move.
 * The result is stored as a real reflection, so Mirror, avoidance detection,
 * the task generator and the ledger all see it. Everything here is pure.
 */

export type EveningOutcome = "done" | "partly" | "didnt";
export type EveningBlocker = "time" | "unclear" | "avoided" | "waiting" | "too_big" | "other";

export const EVENING_OUTCOMES: Array<{ key: EveningOutcome; label: string }> = [
  { key: "done", label: "Done" },
  { key: "partly", label: "Partly" },
  { key: "didnt", label: "Didn't happen" },
];

export const EVENING_BLOCKERS: Array<{ key: EveningBlocker; label: string; text: string }> = [
  { key: "time", label: "Ran out of time", text: "ran out of time" },
  { key: "unclear", label: "Didn't know how", text: "did not know how to do it" },
  { key: "avoided", label: "Avoided it", text: "avoided it" },
  { key: "waiting", label: "Waiting on someone", text: "waiting on someone else" },
  { key: "too_big", label: "Too big", text: "the task was too big" },
  { key: "other", label: "Something else", text: "something else got in the way" },
];

export const EVENING_MARK = "Evening close-out";
export const NOTE_MAX = 400;
export const TOMORROW_MAX = 200;

export interface EveningInput {
  outcome: EveningOutcome;
  blocker?: EveningBlocker | null;
  note: string;
  tomorrow?: string | null;
  task?: string | null;
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export function isOutcome(v: unknown): v is EveningOutcome {
  return v === "done" || v === "partly" || v === "didnt";
}
export function isBlocker(v: unknown): v is EveningBlocker {
  return typeof v === "string" && EVENING_BLOCKERS.some((b) => b.key === v);
}

/** A blocker only makes sense when the task wasn't finished. */
export function needsBlocker(o: EveningOutcome): boolean {
  return o !== "done";
}

/** True when the close-out is complete enough to save. */
export function canSubmit(i: Pick<EveningInput, "outcome" | "blocker" | "note"> | { outcome: EveningOutcome | null; blocker?: EveningBlocker | null; note: string }): boolean {
  if (!i.outcome) return false;
  if (clip(i.note, NOTE_MAX).length < 3) return false;
  if (needsBlocker(i.outcome) && !i.blocker) return false;
  return true;
}

/** The reflection row this close-out becomes. */
export function eveningToReflection(i: EveningInput) {
  const note = clip(i.note, NOTE_MAX);
  const tomorrow = clip(i.tomorrow, TOMORROW_MAX);
  const blockerDef = i.blocker && needsBlocker(i.outcome) ? EVENING_BLOCKERS.find((b) => b.key === i.blocker) : undefined;
  const blocker = blockerDef ? `${blockerDef.text}${note ? ` — ${note}` : ""}`.slice(0, 500) : null;
  return {
    outcome: i.outcome === "done" ? "completed" : i.outcome === "partly" ? "partial" : "blocked",
    today_action: clip(i.task, 2000) || null,
    what_tried: EVENING_MARK,
    what_happened: note,
    what_learned: tomorrow ? `Tomorrow's first move: ${tomorrow}` : null,
    blocker,
    note,
    confidence: 3,
  };
}

export interface TomorrowCarry {
  /** The founder's own words. */
  text: string;
  /** The same move rewritten so it still makes sense the next morning. */
  clear?: string;
  /** The task it continues. */
  task?: string;
  /** Local day the founder wrote it. */
  date: string;
  dismissed?: boolean;
}

/** Show last night's first move this morning and for the rest of tomorrow, not beyond. */
export function carryIsFresh(c: Partial<TomorrowCarry> | null | undefined, todayKey: string): c is TomorrowCarry {
  if (!c || typeof c.text !== "string" || !c.text.trim() || typeof c.date !== "string" || c.dismissed) return false;
  const written = Date.parse(`${c.date}T00:00:00Z`);
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  if (!Number.isFinite(written) || !Number.isFinite(today)) return false;
  const days = Math.round((today - written) / 86_400_000);
  return days === 1;
}

/** One honest line shown after saving; no praise for work that didn't happen. */
export function closingLine(o: EveningOutcome, tomorrow: string | null | undefined): string {
  const next = clip(tomorrow, TOMORROW_MAX);
  if (o === "done") return next ? "Logged. Tomorrow starts with your first move." : "Logged.";
  if (o === "partly") return next ? "Logged. Tomorrow starts with the part you left." : "Logged. Say what's left tomorrow.";
  return next ? "Logged. Tomorrow starts with that move, not a new idea." : "Logged. Tomorrow needs one smaller first move.";
}
