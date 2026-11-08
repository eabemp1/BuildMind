/**
 * lib/leads/engine.ts — Lead Finder. SERVER-SIDE ONLY.
 * plan local queries → search → read the best pages in full → list real places from OpenStreetMap →
 * model extracts leads ONLY from that material → validate (real URL, evidence, not generic) → one retry
 * with narrower queries if the first pass was thin.
 */
import { callModelJSON } from "@/lib/ai-providers";
import { webSearch, discussionSearch, type SearchResult } from "@/lib/search";
import { readPage, isAllowedUrl } from "@/lib/leads/pageReader";
import { findPlaces, type OsmPlace } from "@/lib/leads/osm";
import { cleanInput, cleanQueries, cleanOsmTags, fallbackQueries, type LeadInput, type OsmTag } from "@/lib/leads/plan";
import { validateLeads, type Lead } from "@/lib/leads/validate";
import { isGenericLead } from "@/lib/leads/generic";

export interface LeadRun {
  leads: Lead[];
  thin: boolean;
  queries: string[];
  stats: { searches: number; pagesRead: number; places: number; rounds: number };
}

const MAX_PAGES = 10;
const MAX_PER_DOMAIN = 2;

function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export function pickPages(results: SearchResult[], max = MAX_PAGES): SearchResult[] {
  const perDomain = new Map<string, number>();
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url) || !isAllowedUrl(r.url) || isGenericLead(r.title, r.url)) continue;
    const d = domainOf(r.url);
    if ((perDomain.get(d) ?? 0) >= MAX_PER_DOMAIN) continue;
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
    seen.add(r.url);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

async function planSearch(i: LeadInput, avoid: string[]): Promise<{ queries: string[]; osm: OsmTag[] }> {
  try {
    const p = await callModelJSON<{ queries?: unknown; osm?: unknown }>([
      { role: "system", content: `You plan web searches to find real potential customers for a founder in one place. Return JSON: {"queries": [6 short search queries], "osm": [up to 4 {"key","value"} OpenStreetMap tags for the kinds of places customers work at]}.
Rules: every query must name the city or country. Aim at the customers themselves and where they gather in public: local business pages, associations, directories, public Facebook pages, Telegram channels, marketplaces, local forums, events, complaints about the problem. Never aim at startup or founder communities. Mix wording local people really use. osm keys allowed: amenity, shop, craft, office, healthcare, tourism, leisure; values like restaurant, pharmacy, tailor, clinic, school.${avoid.length ? `\nThese queries already found little, use clearly different angles: ${avoid.join(" | ")}` : ""}` },
      { role: "user", content: `Country: ${i.country}\nCity or area: ${i.city || "not given"}\nCustomers: ${i.customer}\nProblem: ${i.problem}` },
    ], { role: "fast", temperature: 0.3, maxTokens: 500 });
    return { queries: cleanQueries(p?.queries, i), osm: cleanOsmTags(p?.osm) };
  } catch {
    return { queries: fallbackQueries(i), osm: [] };
  }
}

async function pass(i: LeadInput, queries: string[], osmTags: OsmTag[]) {
  const searches = await Promise.allSettled([
    ...queries.slice(0, 5).map((q) => webSearch(q, 6)),
    ...queries.slice(5, 7).map((q) => discussionSearch(q, 6)),
  ]);
  const results: SearchResult[] = [];
  for (const s of searches) {
    // AI-made "results" are guesses, not evidence: never use them to find people.
    if (s.status === "fulfilled" && s.value.provider !== "ai_synthesised" && s.value.provider !== "none") results.push(...s.value.results);
  }
  const chosen = pickPages(results);
  const [texts, places] = await Promise.all([
    Promise.all(chosen.map((r) => readPage(r.url))),
    findPlaces(i.city, i.country, osmTags),
  ]);
  const pages = chosen.map((r, n) => ({ ...r, text: texts[n] || r.snippet || "" })).filter((p) => p.text.length > 40);
  return { pages, places, searches: queries.length, snippets: results };
}

async function extract(i: LeadInput, pages: Array<SearchResult & { text: string }>, places: OsmPlace[], snippets: SearchResult[]): Promise<{ leads: Lead[] }> {
  const allowed = [...pages.map((p) => p.url), ...snippets.map((s) => s.url), ...places.map((p) => p.url)];
  if (!pages.length && !places.length) return { leads: [] };
  const material = [
    ...pages.map((p, n) => `[PAGE ${n + 1}] ${p.title}\nURL: ${p.url}\n${p.text}`),
    places.length ? `[OPENSTREETMAP PLACES]\n${places.map((p) => `- ${p.name} (${p.type}) URL: ${p.url}${p.phone ? ` phone: ${p.phone}` : ""}${p.website ? ` site: ${p.website}` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  try {
    const out = await callModelJSON<{ leads?: unknown }>([
      { role: "system", content: `You find real places a founder can reach their first customers. Use ONLY the material given. Return JSON: {"leads": [up to 12 of {"name","kind","where","url","why_fit","evidence","how_to_reach","first_message"}]}.
Rules:
- kind is one of: business, public_community, page, association, event, listing.
- url MUST be copied exactly from a URL in the material. Never invent one.
- evidence: a short quote or fact taken from the material that shows why this is a real fit (at least one full sentence).
- why_fit: one plain sentence tied to the customers and problem below.
- how_to_reach: one concrete way to contact them in public (page message, listed phone, visit, comment, email on the page). Do not guess private contact details.
- Businesses, public pages, associations, events and public communities only. No private individuals. No startup or founder communities, no big global subreddits.
- first_message: 2 to 4 short plain sentences the founder can send. Say who they are, the specific thing they want to learn or offer, and ask one easy question. No hype, no invented facts or numbers. Write it in the language the founder wrote their customers and problem in.
- Fewer good leads beat many weak ones. If the material holds nothing real, return {"leads": []}.` },
      { role: "user", content: `Customers: ${i.customer}\nProblem: ${i.problem}\nPlace: ${[i.city, i.country].filter(Boolean).join(", ")}\n\nMATERIAL\n${material}` },
    ], { role: "reasoning", temperature: 0.2, maxTokens: 3500 });
    return { leads: validateLeads(out?.leads, allowed) };
  } catch {
    return { leads: [] };
  }
}

export async function findLeads(input: Partial<LeadInput>, deadline = Date.now() + 200_000): Promise<LeadRun> {
  const i = cleanInput(input);
  const stats = { searches: 0, pagesRead: 0, places: 0, rounds: 0 };
  const allQueries: string[] = [];
  let leads: Lead[] = [];
  let avoid: string[] = [];
  for (let round = 1; round <= 2; round++) {
    if (round === 2 && Date.now() > deadline - 90_000) break;
    const plan = await planSearch(i, avoid);
    allQueries.push(...plan.queries);
    const got = await pass(i, plan.queries, plan.osm);
    stats.searches += got.searches; stats.pagesRead += got.pages.length; stats.places += got.places.length; stats.rounds = round;
    const { leads: found } = await extract(i, got.pages, got.places, got.snippets);
    const have = new Set(leads.map((l) => l.url));
    leads = [...leads, ...found.filter((l) => !have.has(l.url))].slice(0, 12);
    if (leads.length >= 6) break;
    avoid = plan.queries;
  }
  return { leads, thin: leads.length < 3, queries: allQueries, stats };
}
