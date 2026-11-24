/** Pure matching for the command palette: no React, no network. */

export interface Searchable { label: string; keywords?: string; hint?: string }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** True when every letter of q appears in s in order ("fcus" matches "focus"). */
function subsequence(q: string, s: string): boolean {
  let i = 0;
  for (const ch of s) { if (ch === q[i]) i++; if (i === q.length) return true; }
  return q.length === 0;
}

/**
 * Higher is better; 0 means no match. Order of strength: label starts with the
 * query, a label word starts with it, label contains it, every query word is
 * somewhere in label/keywords/hint, then a loose in-order letter match on the label.
 */
export function scoreMatch(query: string, c: Searchable): number {
  const q = norm(query);
  if (!q) return 0;
  const label = norm(c.label);
  const hay = norm(`${c.label} ${c.keywords ?? ""} ${c.hint ?? ""}`);
  if (label === q) return 100;
  if (label.startsWith(q)) return 90;
  if (label.split(" ").some((w) => w.startsWith(q))) return 80;
  if (label.includes(q)) return 70;
  const words = q.split(" ");
  if (words.every((w) => hay.split(" ").some((h) => h.startsWith(w)))) return 60;
  if (words.every((w) => hay.includes(w))) return 50;
  if (q.length >= 3 && subsequence(q.replace(/ /g, ""), label.replace(/ /g, ""))) return 25;
  return 0;
}

export function rank<T extends Searchable>(items: T[], query: string, limit = 40): T[] {
  return items
    .map((c, i) => ({ c, i, s: scoreMatch(query, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.c);
}

/** Most recent first, no repeats, capped. */
export function pushRecent(list: string[], id: string, max = 6): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, max);
}
