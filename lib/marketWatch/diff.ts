/**
 * lib/marketWatch/diff.ts — what changed between two weekly snapshots of a founder's market.
 *
 * Pure. Every change is a difference between two things BuildMind actually read (a price printed on
 * a competitor's page, a page that did or did not load, a discussion thread that appeared). Nothing
 * here is scored or guessed, and no sentiment is inferred.
 */

export interface WatchedCompetitor { name: string; url: string; ok: boolean; title: string; price: string | null }
export interface WatchedThread { url: string; title: string; about: string }
export interface MarketSnapshot { weekStart: string; competitors: WatchedCompetitor[]; threads: WatchedThread[] }

export type ChangeKind = "price" | "headline" | "new_competitor" | "page_down" | "page_back" | "new_thread";
export interface MarketChange { kind: ChangeKind; text: string; url?: string }

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Monday of the week containing `d`, as YYYY-MM-DD (UTC). */
export function weekStartOf(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const back = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - back);
  return x.toISOString().slice(0, 10);
}

export function diffSnapshots(prev: MarketSnapshot | null, cur: MarketSnapshot): { baseline: boolean; changes: MarketChange[] } {
  if (!prev) return { baseline: true, changes: [] };
  const changes: MarketChange[] = [];
  const before = new Map(prev.competitors.map((c) => [key(c.name), c]));
  for (const c of cur.competitors) {
    const p = before.get(key(c.name));
    if (!p) { changes.push({ kind: "new_competitor", text: `${c.name} is new in your competitor list.`, url: c.url }); continue; }
    if (p.ok && !c.ok) changes.push({ kind: "page_down", text: `${c.name}'s page did not load this week. It may be a short outage.`, url: c.url });
    else if (!p.ok && c.ok) changes.push({ kind: "page_back", text: `${c.name}'s page loads again.`, url: c.url });
    if (p.ok && c.ok && p.price && c.price && key(p.price) !== key(c.price)) changes.push({ kind: "price", text: `${c.name} now shows ${c.price} on its page. Last week it showed ${p.price}.`, url: c.url });
    if (p.ok && c.ok && p.title && c.title && key(p.title) !== key(c.title)) changes.push({ kind: "headline", text: `${c.name} changed its page title to "${c.title.slice(0, 90)}".`, url: c.url });
  }
  const seen = new Set(prev.threads.map((t) => t.url));
  for (const t of cur.threads) if (!seen.has(t.url)) changes.push({ kind: "new_thread", text: `New discussion about ${t.about}: ${t.title.slice(0, 100)}`, url: t.url });
  return { baseline: false, changes };
}

/** The order a founder should read changes in: money first. */
const ORDER: ChangeKind[] = ["price", "new_competitor", "headline", "new_thread", "page_down", "page_back"];
export const sortChanges = (c: MarketChange[]) => [...c].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
