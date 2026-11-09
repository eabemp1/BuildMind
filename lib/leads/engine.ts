/**
 * lib/leads/engine.ts — Lead Finder. SERVER-SIDE ONLY.
 * plan local queries → search → read the best pages in full → list real places from OpenStreetMap →
 * model extracts leads ONLY from that material → validate (real URL, evidence, not generic) → one retry
 * with narrower queries if the first pass was thin.
 */
import { callModelJSON } from "@/lib/ai-providers";
import { webSearch, discussionSearch, type SearchResult } from "@/lib/search";
import { readPage, readPageWithLinks, isAllowedUrl, type PageLink } from "@/lib/leads/pageReader";
import { findPlaces, type OsmPlace } from "@/lib/leads/osm";
import { cleanInput, cleanQueries, cleanOsmTags, fallbackQueries, targetsFounders, type LeadInput, type OsmTag } from "@/lib/leads/plan";
import { validateLeads, type Lead } from "@/lib/leads/validate";
import { isGenericLead } from "@/lib/leads/generic";

export interface LeadRun {
  leads: Lead[];
  thin: boolean;
  /** Why it came back thin, in plain words (null when it did not). */
  reason: string | null;
  queries: string[];
  stats: { searches: number; resultsFound: number; pagesRead: number; places: number; rounds: number; proposed: number; modelFailed: number; followed: number; modelError?: string };
}

const MAX_PAGES = 10;
const MAX_PER_DOMAIN = 2;

function domainOf(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; }
}

export function pickPages(results: SearchResult[], max = MAX_PAGES, allowGeneric = false): SearchResult[] {
  const perDomain = new Map<string, number>();
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    if (!r.url || seen.has(r.url) || !isAllowedUrl(r.url) || isGenericLead(r.title, r.url, allowGeneric)) continue;
    const d = domainOf(r.url);
    if ((perDomain.get(d) ?? 0) >= MAX_PER_DOMAIN) continue;
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
    seen.add(r.url);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

async function planSearch(i: LeadInput, avoid: string[], found: string[] = []): Promise<{ queries: string[]; osm: OsmTag[] }> {
  try {
    const p = await callModelJSON<{ queries?: unknown; osm?: unknown }>([
      { role: "system", content: `You plan web searches to find real potential customers for a founder in one place. Return JSON: {"queries": [6 short search queries], "osm": [up to 4 {"key","value"} OpenStreetMap tags for the kinds of places customers work at]}.
Rules: every query must name the city or country. Aim at the customers themselves and where they gather in public: local business pages, associations, directories, public Facebook pages, Telegram channels, marketplaces, local forums, events, complaints about the problem. Never aim at startup or founder communities. Mix wording local people really use. osm keys allowed: amenity, shop, craft, office, healthcare, tourism, leisure; values like restaurant, pharmacy, tailor, clinic, school.${avoid.length ? `\nThese queries were already tried, use clearly different angles (other kinds of places, other wording, nearby areas, other languages people there use): ${avoid.join(" | ")}` : ""}${found.length ? `\nAlready found, so look for DIFFERENT kinds of places than these: ${found.slice(0, 12).join(" | ")}` : ""}` },
      { role: "user", content: `Country: ${i.country}\nCity or area: ${i.city || "not given"}\nCustomers: ${i.customer}\nProblem: ${i.problem}` },
    ], { role: "fast", temperature: 0.3, maxTokens: 500 });
    return { queries: cleanQueries(p?.queries, i), osm: cleanOsmTags(p?.osm) };
  } catch {
    return { queries: fallbackQueries(i), osm: [] };
  }
}

type Page = SearchResult & { text: string; links: PageLink[] };

async function pass(i: LeadInput, queries: string[], osmTags: OsmTag[], seen: Set<string>, maxPages: number) {
  const searches = await Promise.allSettled([
    ...queries.slice(0, 5).map((q) => webSearch(q, 6)),
    ...queries.slice(5, 7).map((q) => discussionSearch(q, 6)),
  ]);
  const results: SearchResult[] = [];
  for (const s of searches) {
    // AI-made "results" are guesses, not evidence: never use them to find people.
    if (s.status === "fulfilled" && s.value.provider !== "ai_synthesised" && s.value.provider !== "none") results.push(...s.value.results);
  }
  const chosen = pickPages(results.filter((r) => !seen.has(r.url)), maxPages, targetsFounders(i.customer));
  const [read, places] = await Promise.all([
    Promise.all(chosen.map((r) => readPageWithLinks(r.url))),
    findPlaces(i.city, i.country, osmTags),
  ]);
  const pages: Page[] = chosen.map((r, n) => ({ ...r, text: read[n].text || r.snippet || "", links: read[n].links })).filter((p) => p.text.length > 40);
  return { pages, places, searches: queries.length, snippets: results, resultsFound: results.length };
}

/** From the model's picks, keep only links that were really on the pages, unseen, safe and spread over domains. Pure. */
export function pickFollowLinks(raw: unknown, candidates: PageLink[], seen: Set<string>, allowGeneric: boolean, max = 6): string[] {
  const byUrl = new Map(candidates.map((c) => [c.url, c]));
  const list = Array.isArray(raw) ? raw : [];
  const perDomain = new Map<string, number>();
  const out: string[] = [];
  for (const u of list) {
    if (typeof u !== "string") continue;
    const c = byUrl.get(u);
    if (!c || seen.has(u) || out.includes(u)) continue;
    if (isGenericLead(c.text, u, allowGeneric)) continue;
    const d = domainOf(u);
    if ((perDomain.get(d) ?? 0) >= 2) continue;
    perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
    out.push(u);
    if (out.length >= max) break;
  }
  return out;
}

/** Collect links from the pages we read; ask the model which are worth opening (directories, members, groups, contact, events). */
async function followLinks(i: LeadInput, pages: Page[], seen: Set<string>): Promise<Page[]> {
  const cands: PageLink[] = [];
  const have = new Set<string>();
  for (const p of pages) for (const l of p.links) {
    if (seen.has(l.url) || have.has(l.url)) continue;
    if (domainOf(l.url) === domainOf(p.url) && !l.text) continue;
    have.add(l.url); cands.push(l);
  }
  const shortlist = cands.slice(0, 60);
  if (shortlist.length < 3) return [];
  let picks: string[] = [];
  try {
    const out = await callModelJSON<{ open?: unknown }>([
      { role: "system", content: `You decide which links to open next to find real customers for a founder. Return JSON: {"open": [up to 6 URLs copied exactly from the list]}.
Prefer links that likely lead to: a member or business directory, a list of group admins or shops, an event page, a page of a specific business or community, or contact details. Skip navigation, social-share, shops that only sell the founder's competitors, news homepages and anything unrelated. If nothing looks useful, return {"open": []}.` },
      { role: "user", content: `Customers: ${i.customer}
Place: ${[i.city, i.country].filter(Boolean).join(", ")}

LINKS
${shortlist.map((l) => `- ${l.text || "(no text)"} | ${l.url}`).join("\n")}` },
    ], { role: "fast", temperature: 0.1, maxTokens: 400 });
    picks = pickFollowLinks(out?.open, shortlist, seen, targetsFounders(i.customer));
  } catch { return []; }
  const read = await Promise.all(picks.map((u) => readPage(u)));
  return picks.map((u, n) => ({ title: shortlist.find((l) => l.url === u)?.text || domainOf(u), url: u, snippet: "", source_type: "web" as const, text: read[n], links: [] as PageLink[] }))
    .filter((p) => p.text.length > 40) as Page[];
}

async function extract(i: LeadInput, pages: Page[], places: OsmPlace[], snippets: SearchResult[]): Promise<{ leads: Lead[]; proposed: number; failed: boolean; error?: string }> {
  const allowed = [...pages.map((p) => p.url), ...snippets.map((s) => s.url), ...places.map((p) => p.url)];
  if (!pages.length && !places.length) return { leads: [], proposed: 0, failed: false };
  const system = `You find real places a founder can reach their first customers. Use ONLY the material given. Return JSON: {"leads": [up to 12 of {"name","kind","where","url","why_fit","evidence","how_to_reach","first_message"}]}.
Rules:
- kind is one of: business, public_community, page, association, event, listing.
- url MUST be copied exactly from a URL in the material. Never invent one.
- evidence: a short quote or fact taken from the material that shows why this is a real fit (at least one full sentence).
- why_fit: one plain sentence tied to the customers and problem below.
- how_to_reach: one concrete way to contact them in public (page message, listed phone, visit, comment, email on the page). Do not guess private contact details.
- Businesses, public pages, associations, events and public communities only. No private individuals. No startup or founder communities, no big global subreddits.
- first_message: 2 to 4 short plain sentences the founder can send. Say who they are, the specific thing they want to learn or offer, and ask one easy question. No hype, no invented facts or numbers. Write it in the language the founder wrote their customers and problem in.
- List every real fit you can support with evidence, up to 12. Weak leads are still dropped, but do not stop at two or three when the material holds more. If the material holds nothing real, return {"leads": []}.`;
  const allowFounders = targetsFounders(i.customer);
  // Too much text in one request is the usual reason a model call is refused (token limits). Try a moderate amount,
  // then once more with far less on the fast model, before reporting failure.
  const attempts: Array<{ pages: number; chars: number; snippets: number; role: "reasoning" | "fast" }> = [
    { pages: 12, chars: 2000, snippets: 25, role: "reasoning" },
    { pages: 6, chars: 1100, snippets: 10, role: "fast" },
  ];
  let lastError = "";
  for (const [n, att] of attempts.entries()) {
    try {
      const material = buildLeadMaterial(pages, snippets, places, att, (x) => isAllowedUrl(x.url) && !isGenericLead(x.title, x.url, allowFounders));
      const out = await callModelJSON<{ leads?: unknown }>([
        { role: "system", content: system },
        { role: "user", content: `Customers: ${i.customer}\nProblem: ${i.problem}\nPlace: ${[i.city, i.country].filter(Boolean).join(", ")}\n\nMATERIAL\n${material}` },
      ], { role: att.role, temperature: 0.2, maxTokens: 3000 });
      const proposed = Array.isArray(out?.leads) ? out.leads.length : 0;
      return { leads: validateLeads(out?.leads, allowed, 12, allowFounders), proposed, failed: false };
    } catch (e) {
      lastError = String((e as Error)?.message ?? e).replace(/\s+/g, " ").slice(0, 200);
      console.error(`[leads] extract attempt=${n + 1} failed:`, lastError);
    }
  }
  return { leads: [], proposed: 0, failed: true, error: lastError };
}

/** The text sent to the model: capped pages, each cut short, a few snippets, and the map listings. Pure. */
export function buildLeadMaterial(
  pages: Array<{ title: string; url: string; text: string }>,
  snippets: SearchResult[],
  places: OsmPlace[],
  lim: { pages: number; chars: number; snippets: number },
  keepSnippet: (s: SearchResult) => boolean = () => true,
): string {
  const readUrls = new Set(pages.map((p) => p.url));
  const other = snippets.filter((x) => !readUrls.has(x.url) && keepSnippet(x)).slice(0, lim.snippets);
  return [
    ...pages.slice(0, lim.pages).map((p, n) => `[PAGE ${n + 1}] ${p.title}\nURL: ${p.url}\n${p.text.slice(0, lim.chars)}`),
    other.length ? `[OTHER SEARCH RESULTS, snippets only]\n${other.map((x) => `- ${x.title} URL: ${x.url} ${x.snippet}`.slice(0, 300)).join("\n")}` : "",
    places.length ? `[OPENSTREETMAP PLACES]\n${places.slice(0, 25).map((p) => `- ${p.name} (${p.type}) URL: ${p.url}${p.phone ? ` phone: ${p.phone}` : ""}${p.website ? ` site: ${p.website}` : ""}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export function thinReason(found: number, st: { resultsFound: number; pagesRead: number; places: number; proposed?: number; modelFailed?: number; modelError?: string }): string {
  if ((st.modelFailed ?? 0) > 0 && found === 0) return `I found pages to read, but the AI step failed twice, so nothing could be turned into leads.${st.modelError ? ` Reason: ${st.modelError}` : ""} This is usually a model quota or outage. Try again in a few minutes.`;
  if (st.resultsFound === 0 && st.places === 0) return "The search services returned nothing, so there was nothing to read. This usually means a search key is missing or out of quota, or the place name was not recognised.";
  if (st.pagesRead === 0 && st.places === 0) return "Searches found pages, but none of them could be opened and read.";
  if ((st.proposed ?? 0) > 0 && found === 0) return `I read ${st.pagesRead} pages and the AI suggested ${st.proposed} leads, but none had a link and a quoted fact I could check, so I dropped them rather than show you guesses. Try describing your customers differently.`;
  return `I read ${st.pagesRead} pages${st.places ? ` and ${st.places} map listings` : ""}, but only ${found} held a real customer I could check. Try a bigger city, or describe your customers by what they sell or where they work.`;
}

export async function findLeads(input: Partial<LeadInput>, deadline = Date.now() + 240_000, light = false): Promise<LeadRun> {
  const i = cleanInput(input);
  const stats = { searches: 0, resultsFound: 0, pagesRead: 0, places: 0, rounds: 0, proposed: 0, modelFailed: 0, followed: 0, modelError: undefined as string | undefined };
  const maxRounds = light ? 1 : 3;
  const maxPages = light ? 6 : MAX_PAGES;
  const allQueries: string[] = [];
  const seen = new Set<string>();
  let leads: Lead[] = [];
  for (let round = 1; round <= maxRounds; round++) {
    if (round > 1 && Date.now() > deadline - 80_000) break; // not enough time left for a whole round
    const plan = await planSearch(i, allQueries, leads.map((l) => l.name));
    allQueries.push(...plan.queries);
    const got = await pass(i, plan.queries, plan.osm, seen, maxPages);
    got.pages.forEach((p) => seen.add(p.url));
    // Second hop: open the most promising links found on those pages (directories, member lists, events, contact pages).
    const followed = light ? [] : await followLinks(i, got.pages, seen);
    followed.forEach((p) => seen.add(p.url));
    const pages = [...got.pages, ...followed];
    stats.searches += got.searches; stats.resultsFound += got.resultsFound; stats.pagesRead += pages.length; stats.places += got.places.length; stats.followed += followed.length; stats.rounds = round;
    const { leads: found, proposed, failed, error } = await extract(i, pages, got.places, got.snippets);
    stats.proposed += proposed; stats.modelFailed += failed ? 1 : 0; if (error) stats.modelError = error;
    console.log(`[leads] round=${round} light=${light} results=${got.resultsFound} pages=${got.pages.length} followed=${followed.length} places=${got.places.length} proposed=${proposed} kept=${found.length} modelFailed=${failed}`);
    const have = new Set(leads.map((l) => l.url));
    const haveName = new Set(leads.map((l) => l.name.toLowerCase()));
    leads = [...leads, ...found.filter((l) => !have.has(l.url) && !haveName.has(l.name.toLowerCase()))].slice(0, 12);
    if (leads.length >= 8) break;
  }
  const thin = leads.length < 3;
  return { leads, thin, reason: thin ? thinReason(leads.length, stats) : null, queries: allQueries, stats };
}
