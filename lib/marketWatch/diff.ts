/**
 * lib/marketWatch/diff.ts — what changed between two weekly snapshots of a founder's market.
 *
 * Pure. Every change is a difference between two things BuildMind actually read (a price printed on
 * a competitor's page, a page that did or did not load, a discussion thread that appeared). Nothing
 * here is scored or guessed, and no sentiment is inferred.
 */

export interface WatchedCompetitor { name: string; url: string; ok: boolean; title: string; price: string | null }
import type { ExcludeReason, Freshness } from "@/lib/marketWatch/freshness";

/**
 * A source BuildMind found. `publishedAt` is the page's own date; `checkedAt` is the day BuildMind read it.
 * Snapshots saved before freshness checks have no `status`, and are treated as unverified.
 */
export interface WatchedThread {
  url: string; title: string; about: string;
  publisher?: string; publishedAt?: string; checkedAt?: string;
  status?: Freshness; reason?: ExcludeReason; primary?: boolean;
}
export interface MarketSnapshot { weekStart: string; scannedAt?: string; competitors: WatchedCompetitor[]; threads: WatchedThread[] }

export type ChangeKind = "price" | "headline" | "new_competitor" | "page_down" | "page_back" | "new_thread";
export interface MarketChange { kind: ChangeKind; text: string; url?: string; publisher?: string; publishedAt?: string; checkedAt?: string }

const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * A price as currency + amount + period, so "£35/mo", "£35/month" and "£35 per month" compare equal.
 * Falls back to the plain text key when it cannot read one.
 */
export function priceKey(p: string): string {
  const m = p.toLowerCase().match(/([£$€]|usd|gbp|eur|ghs|ngn)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:(usd|gbp|eur|ghs|ngn))?\s*(?:\/|per|a|each)?\s*(mo(?:nth(?:ly)?)?|m|yr|year(?:ly)?|annual(?:ly)?|week(?:ly)?|wk|day|user|seat)?\b/);
  if (!m) return key(p);
  const cur = ({ "£": "gbp", "$": "usd", "€": "eur" } as Record<string, string>)[m[1] ?? ""] ?? m[1] ?? m[3] ?? "";
  const amount = String(parseFloat(m[2].replace(/,/g, "")));
  const per = m[4] ? (/^m/.test(m[4]) ? "month" : /^(y|a)/.test(m[4]) ? "year" : /^w/.test(m[4]) ? "week" : m[4]) : "";
  return `${cur}${amount}/${per}`;
}

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
    if (p.ok && c.ok && p.price && c.price && priceKey(p.price) !== priceKey(c.price)) changes.push({ kind: "price", text: `${c.name} now shows ${c.price} on its page. Last week it showed ${p.price}.`, url: c.url });
    if (p.ok && c.ok && p.title && c.title && key(p.title) !== key(c.title)) changes.push({ kind: "headline", text: `${c.name} changed its page title to "${c.title.slice(0, 90)}".`, url: c.url });
  }
  const seen = new Set(prev.threads.map((t) => t.url));
  // A new link is only a change when the page itself says it was published this week. Older or undated pages are background at most.
  for (const t of cur.threads) {
    if (seen.has(t.url) || t.status !== "this_week") continue;
    const from = [t.publisher, t.publishedAt ? `published ${t.publishedAt}` : null].filter(Boolean).join(", ");
    changes.push({ kind: "new_thread", text: `New this week about ${t.about}: ${t.title.slice(0, 100)}${from ? ` (${from})` : ""}`, url: t.url, publisher: t.publisher, publishedAt: t.publishedAt, checkedAt: t.checkedAt });
  }
  // Every change says when BuildMind last looked. For a price or title that is when it was seen; only a dated page carries a publication date.
  if (cur.scannedAt) for (const c of changes) c.checkedAt ??= cur.scannedAt;
  return { baseline: false, changes };
}

/** The order a founder should read changes in: money first. */
const ORDER: ChangeKind[] = ["price", "new_competitor", "headline", "new_thread", "page_down", "page_back"];
export const sortChanges = (c: MarketChange[]) => [...c].sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
