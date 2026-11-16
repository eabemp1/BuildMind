/**
 * lib/competitorFit.ts: does a search result describe a product in the founder's own market?
 * A shared name or a shared word like "testing" is not enough. A result counts only when it shares at
 * least one distinctive word with what the founder said the product does or who it is for.
 * When the project says too little to judge, nothing is dropped.
 */
export interface FitProject { name?: string; description?: string; problem?: string; targetUsers?: string }
export interface FitHit { title?: string; snippet?: string; url?: string }

const STOP = new Set(("a an the and or of for to in on at by with from is are was be it its this that these those your you we our their they them who what which into than then so as not no can will just more most very also any all each other over under about up out do does has have had using use used make makes made help helps helping easy simple smart new best one two three way ways get gets getting want need needs per day week month small business businesses people team teams user users customer customers client clients owner owners founder founders startup startups company companies service services product products").split(" "));
const GENERIC = new Set(("software app apps application platform tool tools saas system solution solutions online digital ai automation automated manage management track tracking testing test tests quality assurance data analytics dashboard cloud workflow reminders reminder booking bookings scheduling schedule").split(" "));
// "reminder"/"booking" are generic across many markets, so they cannot prove a market match alone.

const stem = (w: string) => w.replace(/(ing|ers|er|es|s|ed|ly)$/i, "").slice(0, 6);
const words = (t: string) => (t.toLowerCase().match(/[a-z]{3,}/g) ?? []);

/** Words that say what market the product is in. */
export function marketTerms(p: FitProject): string[] {
  const nameWords = new Set(words(p.name ?? "").map(stem));
  const out = new Set<string>();
  for (const w of words(`${p.description ?? ""} ${p.problem ?? ""} ${p.targetUsers ?? ""}`)) {
    if (STOP.has(w) || GENERIC.has(w)) continue;
    const s = stem(w);
    if (s.length < 3 || nameWords.has(s)) continue;
    out.add(s);
  }
  return [...out];
}

export function fitsMarket(p: FitProject, hit: FitHit): boolean {
  const terms = marketTerms(p);
  if (terms.length < 2) return true; // not enough said to judge
  const text = new Set(words(`${hit.title ?? ""} ${hit.snippet ?? ""}`).map(stem));
  return terms.some((t) => text.has(t));
}

export function keepFitting<T extends FitHit>(p: FitProject, hits: T[]): T[] {
  return hits.filter((h) => fitsMarket(p, h));
}
