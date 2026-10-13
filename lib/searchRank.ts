/** Pure helpers: normalise, dedupe, rank and merge search results from several providers. */
import type { SearchResult } from "@/lib/search";

const STOP = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "best", "top", "site", "tool", "software", "startup", "alternatives", "competitors"]);
const NOISE_HOSTS = /(pinterest\.|quora\.com\/unanswered|facebook\.com\/login|linkedin\.com\/pulse\/?$|youtube\.com\/results)/i;

export function normaliseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|ref|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch { return raw.toLowerCase(); }
}
export const hostOf = (raw: string) => { try { return new URL(raw).hostname.replace(/^www\./, "").toLowerCase(); } catch { return raw; } };

export function queryTerms(q: string): string[] {
  return [...new Set(q.toLowerCase().replace(/site:\S+|\bOR\b/g, " ").split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))];
}

export function relevance(r: SearchResult, terms: string[]): number {
  if (!terms.length) return 0.5;
  const hay = `${r.title} ${r.snippet} ${hostOf(r.url)}`.toLowerCase();
  const hit = terms.filter((t) => hay.includes(t)).length;
  const titleHit = terms.filter((t) => r.title.toLowerCase().includes(t)).length;
  return Math.min(1, (hit + titleHit * 0.5) / (terms.length * 1.5));
}

/**
 * Merge ranked lists from several providers. A URL that several providers
 * agree on gets a consensus boost; one result per page, and at most
 * `perHost` results per domain so one site cannot crowd out the rest.
 */
export function mergeResults(lists: SearchResult[][], query: string, limit: number, perHost = 2): SearchResult[] {
  const terms = queryTerms(query);
  const byUrl = new Map<string, { r: SearchResult; score: number; votes: number }>();
  lists.forEach((list) => list.forEach((r, idx) => {
    if (!r?.url || !r.title || NOISE_HOSTS.test(r.url)) return;
    const key = normaliseUrl(r.url);
    const rankScore = 1 / (1 + idx * 0.35);
    const cur = byUrl.get(key);
    if (cur) {
      cur.votes += 1; cur.score += rankScore * 0.6;
      if (r.snippet.length > cur.r.snippet.length) cur.r = { ...cur.r, snippet: r.snippet };
      if (!cur.r.age && r.age) cur.r = { ...cur.r, age: r.age };
    } else byUrl.set(key, { r, score: rankScore, votes: 1 });
  }));
  const scored = [...byUrl.values()]
    .map((e) => ({ r: e.r, s: e.score + relevance(e.r, terms) * 1.2 + (e.votes > 1 ? 0.4 : 0) }))
    .sort((a, b) => b.s - a.s);
  const hostCount = new Map<string, number>();
  const out: SearchResult[] = [];
  for (const { r } of scored) {
    const h = hostOf(r.url);
    const n = hostCount.get(h) ?? 0;
    if (n >= perHost) continue;
    hostCount.set(h, n + 1);
    out.push(r);
    if (out.length >= limit) break;
  }
  return out;
}

/** Tiny TTL cache so repeated agent runs in one instance don't burn quota. */
const CACHE = new Map<string, { at: number; v: unknown }>();
export function cacheGet<T>(k: string, ttlMs: number): T | null {
  const e = CACHE.get(k);
  if (!e || Date.now() - e.at > ttlMs) { CACHE.delete(k); return null; }
  return e.v as T;
}
export function cacheSet(k: string, v: unknown) {
  if (CACHE.size > 200) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(k, { at: Date.now(), v });
}
