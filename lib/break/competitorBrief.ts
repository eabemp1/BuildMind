/**
 * lib/break/competitorBrief.ts — turns the Competitor agent's raw output into
 * rows that say where each fact came from.
 *
 * Rule: price and "what they do" are only called "from their site" when we
 * actually read that site. Whatever the model says about pricing is ignored;
 * the price shown is the one found on the page, or "not verified".
 */
import type { ScrapedCompetitor } from "@/lib/agents";

export interface BriefCompetitor {
  name: string;
  url?: string;
  whatTheyDo?: string;
  targetCustomer?: string;
  pricing: string;
  strength?: string;
  weakness: string;
  howYouLose?: string;
  threat_level: "low" | "medium" | "high";
  /** true only when we read their own page this run. */
  siteRead: boolean;
}

type Raw = {
  name?: unknown; url?: unknown; what_they_do?: unknown; target_customer?: unknown;
  strength?: unknown; weakness?: unknown; how_you_lose?: unknown; threat_level?: unknown;
};

const s = (v: unknown, max = 220): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const host = (u?: string) => { try { return new URL(u ?? "").hostname.replace(/^www\./, ""); } catch { return ""; } };
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Find the scraped entry a model-named competitor refers to (by URL host or name). */
export function matchScraped(name: string, url: string | undefined, scraped: ScrapedCompetitor[]): ScrapedCompetitor | undefined {
  const h = host(url);
  const n = norm(name);
  return scraped.find((c) => {
    if (h && host(c.url) === h) return true;
    const ch = host(c.url).split(".")[0];
    return n.length >= 3 && (norm(c.title).includes(n) || (ch && ch === n));
  });
}

const NEG = /\b(?:doesn'?t|does not|don'?t|do not|didn'?t|lacks?|lacking|without|no|not|never|fails? to|missing)\b/i;
const FILLER = new Set(("their they them the and for with that this from have has are was not its into than then very more most also only about those these such other what when where which while does doesn don lack lacks lacking without never fails fail missing highlight highlights highlighted offer offers offered mention mentions mentioned have support supports feature features product page site website customers customer users user").split(" "));
const stems = (t: string) => (t.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter((w) => !FILLER.has(w)).map((w) => w.replace(/(ing|ers|er|es|s|ed|ly|ion)$/, "").slice(0, 6));

/**
 * Drops any "they lack X" sentence when the same row (or their own page text) says they do X.
 * A weakness that contradicts the facts next to it is worse than none.
 */
export function dropContradictedWeakness(weakness: string, positive: string): string {
  const pos = new Set(stems(positive));
  const kept = weakness.split(/(?<=[.!?])\s+/).filter((sent) => {
    if (!NEG.test(sent)) return true;
    const after = sent.slice(sent.search(NEG));
    return !stems(after).some((w) => pos.has(w));
  });
  return kept.join(" ").trim();
}

export function normalizeCompetitors(raw: Raw[] | undefined, scraped: ScrapedCompetitor[]): BriefCompetitor[] {
  if (!Array.isArray(raw)) return [];
  const out: BriefCompetitor[] = [];
  for (const r of raw.slice(0, 5)) {
    const name = s(r?.name, 60);
    if (!name) continue;
    const hit = matchScraped(name, s(r.url, 200) || undefined, scraped);
    const facts = hit?.pageFacts;
    const siteRead = Boolean(facts?.read);
    const prices = facts?.prices ?? [];
    const pricing = prices.length
      ? `Seen on their site: ${prices.slice(0, 3).join(", ")}`
      : siteRead
        ? (facts?.pricingPageSeen ? "Has a pricing page; no price read" : "No price on the pages we read")
        : "Not verified (their site was not read)";
    const t = r.threat_level;
    out.push({
      name,
      url: s(r.url, 200) || hit?.url || undefined,
      whatTheyDo: s(r.what_they_do) || undefined,
      targetCustomer: s(r.target_customer, 140) || undefined,
      pricing,
      strength: s(r.strength) || undefined,
      weakness: dropContradictedWeakness(s(r.weakness), `${s(r.what_they_do, 400)} ${s(r.strength, 400)} ${hit?.snippet ?? ""}`) || "No specific gap identified yet.",
      howYouLose: dropContradictedWeakness(s(r.how_you_lose), `${s(r.what_they_do, 400)} ${s(r.strength, 400)} ${hit?.snippet ?? ""}`) || undefined,
      threat_level: t === "high" || t === "low" ? t : "medium",
      siteRead,
    });
  }
  return out;
}

/** One honest line for the summary: biggest threat first, then how much we actually read. */
export function competitorSummaryLine(
  rows: BriefCompetitor[],
  biggest: { name?: unknown; why?: unknown } | undefined,
  saturation: string | undefined,
): string {
  if (!rows.length) return "No competitors found in live search. Try more specific market terms.";
  const read = rows.filter((r) => r.siteRead).length;
  const name = s(biggest?.name, 60), why = s(biggest?.why, 200);
  const head = name && why ? `Biggest threat: ${name}. ${why}` : `${rows.length} competitors mapped.`;
  const crowd = saturation === "high" ? " The space is crowded." : "";
  return `${head}${crowd} We read the sites of ${read} of ${rows.length}; the rest is our inference.`;
}
