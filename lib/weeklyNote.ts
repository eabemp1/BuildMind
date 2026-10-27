/** One honest line about the week, from counts. Says nothing when there is nothing to say. */
export interface WeekCounts { done: number; prevDone: number; radarActed: number }

export function weeklyNote(c: WeekCounts): string | null {
  if (c.done === 0 && c.prevDone === 0 && c.radarActed === 0) return null;
  const parts: string[] = [];
  const t = (n: number) => `${n} task${n === 1 ? "" : "s"}`;
  if (c.done > 0 || c.prevDone > 0) {
    const diff = c.done - c.prevDone;
    parts.push(`You closed ${t(c.done)} in the last 7 days${c.prevDone > 0 || diff !== 0 ? `, ${diff === 0 ? `the same as the week before` : diff > 0 ? `${diff} more than the week before` : `${-diff} fewer than the week before`}` : ""}.`);
  }
  if (c.radarActed > 0) parts.push(`You acted on ${c.radarActed} Radar item${c.radarActed === 1 ? "" : "s"}.`);
  return parts.join(" ");
}
