/**
 * Where a price in a report came from. A price is only evidence if the founder wrote it or a competitor's own page
 * listed it. A price the model suggested is not evidence, so it is shown as "a price you choose".
 * Matching is exact on amount, currency and billing period: $400 is not $40, and £95/month is not £95/year.
 */
export type PriceSource = { name: string; url?: string; price: string };
type Parsed = { amount: number; currency: string; period: string };

const AMOUNT = /(?:([$£€])|\b(GHS|USD|GBP|EUR)\b)\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(?:\/|per|a)\s?(month|mo|year|yr|annum)\b|\s?(monthly|yearly|annually)\b)?/gi;
const CUR: Record<string, string> = { "$": "USD", "£": "GBP", "€": "EUR" };

function parse(m: RegExpMatchArray | RegExpExecArray): Parsed {
  const cur = m[1] ? CUR[m[1]] : m[2].toUpperCase();
  const p = (m[4] ?? m[5] ?? "").toLowerCase();
  const period = /^mo/.test(p) ? "month" : /^(y|a)/.test(p) ? "year" : "";
  return { amount: Number(m[3].replace(/,/g, "")), currency: cur, period };
}
const same = (a: Parsed, b: Parsed) => a.amount === b.amount && a.currency === b.currency && a.period === b.period;
const pricesIn = (t: string): Parsed[] => [...t.matchAll(AMOUNT)].map(parse);

export type Provenance = "founder" | "competitor" | "none";

/** Rewrite every price in `text` with its source, or replace it. Text with no price is returned unchanged. */
export function annotatePrices(text: string, founderText: string, competitors: PriceSource[]): string {
  const founder = pricesIn(founderText);
  const comp = competitors.flatMap((c) => pricesIn(c.price).map((p) => ({ c, p })));
  const notes: string[] = [];
  const out = text.replace(AMOUNT, (...a) => {
    const raw = a[0] as string;
    const p = parse(a as unknown as RegExpMatchArray);
    const hit = comp.find((x) => same(x.p, p));
    if (hit) {
      const n = `${raw.trim()} is ${hit.c.name}'s listed price${hit.c.url ? ` on ${hit.c.url}` : ""}, not a price a customer told you`;
      if (!notes.includes(n)) notes.push(n);
      return raw;
    }
    if (founder.some((f) => same(f, p))) {
      const n = `${raw.trim()}: Founder hypothesis, not tested with customers`;
      if (!notes.includes(n)) notes.push(n);
      return raw;
    }
    return "a price you choose";
  });
  return notes.length ? `${out} (${notes.join("; ")}.)` : out;
}

/** Apply annotatePrices to every string inside a value (used for the Proof layer, which holds generated tests). */
export function annotateDeep<T>(v: T, founderText: string, competitors: PriceSource[]): T {
  if (typeof v === "string") return annotatePrices(v, founderText, competitors) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => annotateDeep(x, founderText, competitors)) as unknown as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, annotateDeep(x, founderText, competitors)])) as T;
  return v;
}

/** Prices competitors' own pages showed, from the saved report. Works on reports saved before this change. */
export function listedPrices(data: { agent_outputs?: Record<string, unknown> | null }): PriceSource[] {
  const brief = (data.agent_outputs?.competitor as { brief?: unknown } | null | undefined)?.brief;
  const rows = Array.isArray(brief) ? (brief as Array<Record<string, unknown>>) : [];
  const out: PriceSource[] = [];
  for (const c of rows) {
    const m = /^Seen on their site:\s*(.+)$/i.exec(typeof c.pricing === "string" ? c.pricing.trim() : "");
    if (!m) continue;
    for (const price of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
      out.push({ name: typeof c.name === "string" ? c.name : "A competitor", url: typeof c.url === "string" ? c.url : undefined, price });
    }
  }
  return out;
}
