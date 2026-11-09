/**
 * lib/roadmap/match.ts — decide whether the action a founder just finished on Today is really one of their open
 * roadmap tasks. Pure. It only ever SUGGESTS a match; the founder confirms before anything is ticked.
 */
export interface OpenTask { id: string; title: string; milestone: string }
export interface RoadmapMatch extends OpenTask { score: number }

const STOP = new Set(["the", "and", "for", "with", "that", "this", "your", "you", "from", "into", "about", "then", "them", "have", "will", "their", "each", "one", "two", "three", "first", "next", "get", "make", "do", "to", "of", "in", "on", "a", "an", "at", "by", "is", "it", "or", "up", "out", "all", "any", "new", "use", "using", "per", "via"]);

export function tokens(text: string): string[] {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[^a-z0-9À-￿\s]/g, " ").split(/\s+/)) {
    let w = raw;
    if (w.length > 4 && w.endsWith("ies")) w = `${w.slice(0, -3)}y`;
    else if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** Best open task for this action, or null when nothing is clearly the same piece of work. */
export function matchRoadmapTask(action: string, open: OpenTask[]): RoadmapMatch | null {
  const a = new Set(tokens(action));
  if (a.size < 2) return null;
  const scored: RoadmapMatch[] = [];
  for (const t of open) {
    const tt = tokens(t.title);
    if (tt.length < 2) continue;
    const shared = tt.filter((w) => a.has(w)).length;
    if (shared < 2) continue;
    // Share of the task's own words that appear in the action: a short task fully covered scores high.
    const score = shared / tt.length;
    if (score >= 0.6) scored.push({ ...t, score });
  }
  scored.sort((x, y) => y.score - x.score);
  if (!scored.length) return null;
  // Two tasks equally good: do not guess which one the founder meant.
  if (scored[1] && scored[0].score - scored[1].score < 0.1) return null;
  return scored[0];
}
