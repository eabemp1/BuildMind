/**
 * lib/demand/engine.ts — Demand Check. SERVER-SIDE ONLY.
 * Search for the way people really ask for this → read the pages → the model quotes the posts →
 * keep only quotes that appear word for word on a page we read.
 */
import { callModelJSON } from "@/lib/ai-providers";
import { webSearch, discussionSearch, type SearchResult } from "@/lib/search";
import { readPage } from "@/lib/leads/pageReader";
import { pickPages } from "@/lib/leads/engine";
import { cleanInput, targetsFounders, type LeadInput } from "@/lib/leads/plan";
import { demandQueries, validateSignals, groupThemes, demandHeadline, type Signal, type Theme } from "@/lib/demand/signals";

export interface DemandRun {
  signals: Signal[];
  themes: Theme[];
  headline: string;
  stats: { searches: number; resultsFound: number; pagesRead: number; proposed: number; modelFailed: boolean };
}

export async function checkDemand(input: Partial<LeadInput>): Promise<DemandRun> {
  const i = cleanInput(input);
  const queries = demandQueries(i);
  const settled = await Promise.allSettled([
    ...queries.slice(0, 3).map((q) => discussionSearch(q, 8)),
    ...queries.slice(3).map((q) => webSearch(q, 8)),
  ]);
  const results: SearchResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value.provider !== "ai_synthesised" && s.value.provider !== "none") results.push(...s.value.results);
  }
  const chosen = pickPages(results, 14, true); // discussions on big forums are exactly where demand shows up
  const texts = await Promise.all(chosen.map((r) => readPage(r.url, 5000)));
  const textByUrl = new Map<string, string>();
  chosen.forEach((r, n) => { const t = texts[n] || r.snippet || ""; if (t.length > 40) textByUrl.set(r.url, t); });
  // Snippets of results we did not open can also carry a real quote.
  for (const r of results) if (!textByUrl.has(r.url) && r.snippet && r.snippet.length > 60) textByUrl.set(r.url, r.snippet);

  const stats = { searches: queries.length, resultsFound: results.length, pagesRead: chosen.filter((r) => (texts[chosen.indexOf(r)] ?? "").length > 40).length, proposed: 0, modelFailed: false };
  const place = [i.city, i.country].filter(Boolean).join(", ");
  if (!textByUrl.size) return { signals: [], themes: [], headline: demandHeadline(0, place), stats };

  const material = [...textByUrl].slice(0, 40).map(([u, t], n) => `[SOURCE ${n + 1}] URL: ${u}\n${t.slice(0, 2500)}`).join("\n\n");
  try {
    const out = await callModelJSON<{ signals?: unknown }>([
      { role: "system", content: `You count real public demand. From the SOURCES only, find posts or comments where a real person in or about ${place || "the place"} asks for, complains about, works around, or wishes for something related to the need below. Return JSON: {"signals": [up to 30 of {"quote","url","kind","theme","place"}]}.
Rules:
- quote: copied WORD FOR WORD from the source text, 25 to 300 characters. Never paraphrase, never fix spelling, never join two places. If you cannot copy it exactly, leave it out.
- url: the SOURCE url the quote came from, exactly as given.
- kind: ask (looking for it), complaint (unhappy with what exists), workaround (doing it by hand or with something clumsy), or wish (wants it to exist).
- theme: 2 to 4 words naming the specific need, in lower case, reused when two quotes are about the same thing.
- place: the city or area the person is in if the text says so, else empty.
- Skip articles, ads, sellers promoting their own product, and generic advice. Only people expressing their own need.
- If the sources hold nothing real, return {"signals": []}.` },
      { role: "user", content: `Need: ${i.problem || i.customer}\nWho has it: ${i.customer}${targetsFounders(i.customer) ? " (these are founders)" : ""}\n\nSOURCES\n${material}` },
    ], { role: "reasoning", temperature: 0.1, maxTokens: 4000 });
    stats.proposed = Array.isArray(out?.signals) ? out.signals.length : 0;
    const signals = validateSignals(out?.signals, textByUrl);
    console.log(`[demand] results=${results.length} pages=${stats.pagesRead} proposed=${stats.proposed} kept=${signals.length}`);
    return { signals, themes: groupThemes(signals), headline: demandHeadline(signals.length, place), stats };
  } catch (e) {
    console.error("[demand] extract failed:", (e as Error)?.message ?? e);
    stats.modelFailed = true;
    return { signals: [], themes: [], headline: "The AI step failed, so nothing was counted. This is usually a model quota or outage. Try again in a few minutes.", stats };
  }
}
