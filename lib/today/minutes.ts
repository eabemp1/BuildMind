/**
 * lib/today/minutes.ts: one time for the task, everywhere.
 * The task sentence, the time label and the focus timer used to disagree (30 in the sentence,
 * 60 from the task type, 45 from the timer preset). When the sentence states exactly one
 * number of minutes, that number wins. Otherwise the task type's time is used.
 */
const MINUTES_RE = /\b(\d{1,3})\s*(?:-|–|to)?\s*(\d{1,3})?\s*(?:minutes?|mins?)\b/gi;

export function statedMinutes(action: string): number | null {
  const found = new Set<number>();
  for (const m of action.matchAll(MINUTES_RE)) {
    const high = Number(m[2] ?? m[1]);
    if (high >= 5 && high <= 180) found.add(high);
  }
  return found.size === 1 ? [...found][0] : null;
}

export function taskMinutes(action: string, missionMinutes: number, cap?: number | null): number {
  const m = statedMinutes(action) ?? missionMinutes;
  return cap && cap > 0 ? Math.min(m, cap) : m;
}
