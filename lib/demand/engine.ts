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
  stats: { searches: number; resultsFound: number; pagesRead: number; proposed: number; modelFailed: boolean; modelError?: string };
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

  const stats = { searches: queries.length, resultsFound: results.length, pagesRead: chosen.filter((r) => (texts[chosen.indexOf(r)] ?? "").length > 40).length, proposed: 0, modelFailed: false, modelError: undefined as string | undefined };
  const place = [i.city, i.country].filter(Boolean).join(", ");
  if (!textByUrl.size) return { signals: [], themes: [], headline: demandHeadline(0, place), stats };

  const system = `You count real public demand. From the SOURCES only, find posts or comments where a real person in or about ${place || "the place"} asks for, complains about, works around, or wishes for something related to the need below. Return JSON: {"signals": [up to 30 of {"quote","url","kind","theme","place"}]}.
Rules:
- quote: copied WORD FOR WORD from the source text, 25 to 300 characters. Never paraphrase, never fix spelling, never join two places. If you cannot copy it exactly, leave it out.
- url: the SOURCE url the quote came from, exactly as given.
- kind: ask (looking for it), complaint (unhappy with what exists), workaround (doing it by hand or with something clumsy), or wish (wants it to exist).
- theme: 2 to 4 words naming the specific need, in lower case, reused when two quotes are about the same thing.
- place: the city or area the person is in if the text says so, else empty.
- Skip articles, ads, sellers promoting their own product, and generic advice. Only people expressing their own need.
- If the sources hold nothing real, return {"signals": []}.`;
  const user = (material: string) => `Need: ${i.problem || i.customer}\nWho has it: ${i.customer}${targetsFounders(i.customer) ? " (these are founders)" : ""}\n\nSOURCES\n${material}`;

  // First try a moderate amount of text. Too much text in one request is the usual reason a model call is refused
  // (token limits on the free tiers), so if it fails, retry once with far less before giving up.
  const attempts: Array<{ sources: number; chars: number; role: "reasoning" | "fast" }> = [
    { sources: 24, chars: 1600, role: "reasoning" },
    { sources: 10, chars: 1000, role: "fast" },
  ];
  for (const [n, att] of attempts.entries()) {
    try {
      const out = await callModelJSON<{ signals?: unknown }>([
        { role: "system", content: system },
        { role: "user", content: user(buildMaterial(textByUrl, att.sources, att.chars)) },
      ], { role: att.role, temperature: 0.1, maxTokens: 3000 });
      stats.proposed = Array.isArray(out?.signals) ? out.signals.length : 0;
      const signals = validateSignals(out?.signals, textByUrl);
      console.log(`[demand] attempt=${n + 1} results=${results.length} pages=${stats.pagesRead} proposed=${stats.proposed} kept=${signals.length}`);
      return { signals, themes: groupThemes(signals), headline: demandHeadline(signals.length, place), stats };
    } catch (e) {
      stats.modelFailed = true;
      stats.modelError = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 200);
      console.error(`[demand] attempt=${n + 1} failed:`, stats.modelError);
    }
  }
  return { signals: [], themes: [], headline: "The AI step failed twice, so nothing was counted. The reason is shown below; it is usually a model quota or outage. Try again in a few minutes.", stats };
}

/** The text sent to the model: a capped number of sources, each cut short. Pure. */
export function buildMaterial(textByUrl: Map<string, string>, maxSources: number, charsEach: number): string {
  return [...textByUrl].slice(0, maxSources).map(([u, t], n) => `[SOURCE ${n + 1}] URL: ${u}\n${t.slice(0, charsEach)}`).join("\n\n");
}
