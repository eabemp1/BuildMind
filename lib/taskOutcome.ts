/**
 * lib/taskOutcome.ts — which check-in outcomes count as work done.
 * A founder who reports "blocked" has been honest, and that is worth recording, but nothing was completed.
 * Momentum, XP, completion counts and the "completed a task" event must not move for it.
 */
export type CheckInOutcome = "completed" | "partial" | "learned" | "blocked" | "skipped" | "abandoned";

export function countsAsDone(outcome: unknown): boolean {
  return !["blocked", "skipped", "abandoned"].includes(String(outcome ?? "completed"));
}

/** What the top status strip says about today's task. */
export function taskStripLabel(done: boolean, outcome: string | null): string {
  if (!done) return "not yet";
  if (outcome === "blocked") return "blocked";
  if (outcome === "skipped" || outcome === "abandoned") return "skipped";
  if (outcome === "partial") return "partly done";
  if (outcome === "learned") return "learned";
  if (outcome === "completed") return "done";
  return "checked in";
}
