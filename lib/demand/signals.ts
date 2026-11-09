/**
 * lib/demand/signals.ts — pure helpers for the Demand Check. A "signal" is a public post where a real person
 * asked for, complained about, or worked around the thing the founder wants to build.
 * The model may only report signals whose quote appears word for word in the material it was shown.
 */
import type { LeadInput } from "@/lib/leads/plan";

export type SignalKind = "ask" | "complaint" | "workaround" | "wish";
const KINDS: SignalKind[] = ["ask", "complaint", "workaround", "wish"];

export interface Signal { quote: string; url: string; kind: SignalKind; theme: string; place: string }
export interface Theme { name: string; count: number }

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const norm = (v: string) => v.toLowerCase().replace(/[‘’“”"'`]/g, "").replace(/[^a-z0-9À-￿]+/g, " ").trim();
const urlKey = (u: string) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/$/, "")}`.toLowerCase(); } catch { return u.toLowerCase(); } };

/** Queries shaped like the things people actually write when they want something. */
export function demandQueries(i: LeadInput): string[] {
  const place = [i.city, i.country].filter(Boolean).join(" ");
  const need = i.problem || i.customer;
  const who = i.customer;
  const out = [
    `"where can I find" ${need} ${place}`,
    `"anyone know" OR "does anyone" ${need} ${place}`,
    `"I wish" OR "looking for" ${need} ${place}`,
    `${need} ${place} too expensive OR "hard to find" OR frustrating`,
    `${who} ${place} complain ${need}`,
    `how do ${who} ${need} ${place} without an app`,
  ];
  return out.map((q) => q.replace(/\s+/g, " ").trim().slice(0, 160));
}

/** True when `quote` appears (ignoring case, spacing and punctuation) in any of the texts. */
export function quoteInMaterial(quote: string, texts: string[]): boolean {
  const q = norm(quote);
  if (q.length < 25) return false;
  return texts.some((t) => norm(t).includes(q));
}

/**
 * Find where a quote really sits in a page. Models often change a word, a spelling or the punctuation when they
 * "copy", so exact matching threw away real posts. This accepts a quote when at least 80% of its words (and at least
 * 5) appear as one unbroken run on the page, and returns the page's OWN words for that run, so what is shown is
 * always real text from the page, never the model's rewording.
 */
export function locateQuote(quote: string, text: string): string | null {
  const q = norm(quote).split(" ").filter(Boolean);
  if (q.length < 5) return norm(quote).length >= 25 && norm(text).includes(norm(quote)) ? quote : null;
  const words: Array<{ n: string; start: number; end: number }> = [];
  for (const m of text.matchAll(/\S+/g)) {
    const n = norm(m[0]);
    if (n) words.push({ n, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  // Slide a window about the quote's length over the page and keep the one that shares the most of the quote's
  // words in order (a longest common subsequence). A changed or merged word then costs one word, not the whole match.
  const qset = new Set(q);
  const span = q.length + 3;
  let best = 0, bestStart = -1;
  for (let st = 0; st + 1 <= words.length; st++) {
    if (!qset.has(words[st].n)) continue; // a good window starts on one of the quote's words
    const win = words.slice(st, st + span);
    let prev = new Array<number>(win.length + 1).fill(0);
    for (let i = 1; i <= q.length; i++) {
      const cur = new Array<number>(win.length + 1).fill(0);
      for (let j = 1; j <= win.length; j++) cur[j] = q[i - 1] === win[j - 1].n ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      prev = cur;
    }
    const lcs = prev[win.length];
    if (lcs > best) { best = lcs; bestStart = st; }
  }
  if (best < Math.max(5, Math.ceil(q.length * 0.8))) return null;
  // Re-run the best window keeping the whole table, then walk back to find which page words really matched.
  const win = words.slice(bestStart, bestStart + span);
  const t: number[][] = Array.from({ length: q.length + 1 }, () => new Array<number>(win.length + 1).fill(0));
  for (let i = 1; i <= q.length; i++) for (let j = 1; j <= win.length; j++) t[i][j] = q[i - 1] === win[j - 1].n ? t[i - 1][j - 1] + 1 : Math.max(t[i - 1][j], t[i][j - 1]);
  let i = q.length, j = win.length, firstJ = -1, lastJ = -1;
  while (i > 0 && j > 0) {
    if (q[i - 1] === win[j - 1].n && t[i][j] === t[i - 1][j - 1] + 1) { if (lastJ < 0) lastJ = j - 1; firstJ = j - 1; i--; j--; }
    else if (t[i - 1][j] >= t[i][j - 1]) i--;
    else j--;
  }
  if (firstJ < 0) return null;
  const excerpt = text.slice(win[firstJ].start, win[lastJ].end).trim().slice(0, 300);
  return excerpt.length >= 25 ? excerpt : null;
}

export function validateSignals(raw: unknown, textByUrl: Map<string, string>, max = 30): Signal[] {
  const list = Array.isArray(raw) ? raw : [];
  const texts = new Map<string, string>();
  for (const [u, t] of textByUrl) texts.set(urlKey(u), t);
  const seenQuote = new Set<string>();
  const perUrl = new Map<string, number>();
  const out: Signal[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const quote = clean(r.quote, 300);
    const url = clean(r.url, 400);
    const text = texts.get(urlKey(url));
    if (!quote || !text) continue;                       // the URL must be one we really read
    const real = locateQuote(quote, text);               // the words must be on that page
    if (!real) continue;
    const qk = norm(real);
    if (seenQuote.has(qk)) continue;
    const k = urlKey(url);
    if ((perUrl.get(k) ?? 0) >= 3) continue;             // one busy page must not look like many people
    seenQuote.add(qk); perUrl.set(k, (perUrl.get(k) ?? 0) + 1);
    out.push({
      quote: real, url,
      kind: KINDS.includes(r.kind as SignalKind) ? (r.kind as SignalKind) : "ask",
      theme: clean(r.theme, 50).toLowerCase() || "other",
      place: clean(r.place, 80),
    });
    if (out.length >= max) break;
  }
  return out;
}

export function groupThemes(signals: Signal[], top = 6): Theme[] {
  const m = new Map<string, number>();
  for (const s of signals) m.set(s.theme, (m.get(s.theme) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, top);
}

/** One honest sentence about what the count means. */
export function demandHeadline(count: number, place: string): string {
  const where = place || "your area";
  if (count === 0) return `I could not find public posts about this in ${where}. That does not mean nobody wants it: much of this talk happens in private groups and chats I cannot see.`;
  if (count < 5) return `I found ${count} public ${count === 1 ? "post" : "posts"} about this in ${where}. That is a small signal, and a lower bound: private groups and chats are invisible to me.`;
  return `I found ${count} public posts from people in ${where} asking for, or struggling with, something like this. The real number is higher, because private groups and chats are invisible to me.`;
}
