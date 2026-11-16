/**
 * lib/modelPrices.ts: published per-million-token prices for the models BuildMind calls, so a job's token estimate
 * can be shown as an approximate dollar figure. LIST prices: a free tier (Groq, Gemini) costs you nothing, but the list
 * price is what the same use would cost once paid. A model with no verified price returns null and is counted as
 * unpriced, never guessed. Prices change: update this table, and the date, when a provider changes them.
 *
 * Sources, read 2026-11-16:
 *  - Groq: GroqCloud pricing, as listed at morphllm.com/groq-pricing dated 2026-10-13 (gpt-oss-120b, qwen3.8-27b preview).
 *  - Gemini: ai.google.dev/gemini-api/docs/pricing (3.8 Flash and 3.6 Flash; the page says these rise on 2027-01-01).
 *  - OpenRouter "openrouter/free": the free router, no charge.
 *  - Not verified, so unpriced: Cerebras, Mistral.
 */
export interface Price { inPerM: number; outPerM: number }
interface Entry { match: string; price: Price; from?: string; until?: string }

// Entries with the same match are tried in order; `until` is an exclusive date (YYYY-MM-DD).
const TABLE: Entry[] = [
  { match: "groq:openai/gpt-oss-120b", price: { inPerM: 0.15, outPerM: 0.6 } },
  { match: "groq:qwen/qwen3.8-27b", price: { inPerM: 0.8, outPerM: 4.0 } },
  { match: "gemini:gemini-3.8-flash", price: { inPerM: 0.75, outPerM: 3.75 }, until: "2027-01-01" },
  { match: "gemini:gemini-3.8-flash", price: { inPerM: 1.5, outPerM: 7.5 }, from: "2027-01-01" },
  { match: "gemini:gemini-3.6-flash", price: { inPerM: 0.75, outPerM: 3.75 }, until: "2027-01-01" },
  { match: "gemini:gemini-3.6-flash", price: { inPerM: 1.5, outPerM: 7.5 }, from: "2027-01-01" },
  { match: "openrouter:openrouter/free", price: { inPerM: 0, outPerM: 0 } },
];

export function priceFor(label: string, now: Date = new Date()): Price | null {
  const day = now.toISOString().slice(0, 10);
  const key = label.toLowerCase();
  for (const e of TABLE) {
    if (key !== e.match) continue;
    if (e.from && day < e.from) continue;
    if (e.until && day >= e.until) continue;
    return e.price;
  }
  return null;
}

/** Approximate USD for one call, or null when the model has no verified price. */
export function estimateUsd(label: string, inTokens: number, outTokens: number, now?: Date): number | null {
  const p = priceFor(label, now);
  if (!p) return null;
  return (inTokens * p.inPerM + outTokens * p.outPerM) / 1_000_000;
}
