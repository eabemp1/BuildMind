/**
 * lib/search.ts — BuildMind Web Search Engine
 *
 * A priority waterfall — tries each provider in order, fails fast on
 * quota/auth errors, hands off to the next. Every provider returns the
 * same SearchResult shape so callers never know or care which fired.
 *
 * Priority order (per founder's instruction — Serper is last):
 *   1. Brave Search API     — structured JSON, discussions endpoint, 2k free/month
 *   2. Tavily               — AI-native, 1k free/month, best quality per query
 *   3. DDG lite scrape      — no key, free forever, fragile HTML parsing
 *   4. Serper (Google)      — highest quality but trial-limited, kept as backup
 *   5. AI synthesis         — always available, marked as inferred not scraped
 *
 * Env vars:
 *   BRAVE_SEARCH_API_KEY    — https://api.search.brave.com/app/keys (free tier)
 *   TAVILY_API_KEY          — https://tavily.com (free tier)
 *   SERPER_API_KEY          — https://serper.dev (free trial 2.5k queries)
 *
 * Usage:
 *   import { webSearch, discussionSearch } from "@/lib/search";
 *   const results = await webSearch("BuildMind competitors startup tools");
 *   const signals = await discussionSearch("solo founder pain points productivity");
 *
 * SERVER-SIDE ONLY.
 */

export interface SearchResult {
  title:       string;
  url:         string;
  snippet:     string;
  age?:        string;   // "2 days ago", "Jan 2025" etc. when available
  source_type: "web" | "discussion" | "news";
}

export interface SearchResponse {
  results:  SearchResult[];
  provider: "brave" | "tavily" | "ddg" | "serper" | "ai_synthesised" | "none";
  scraped:  boolean;        // false when AI-synthesised
  query:    string;
}

const TIMEOUT_MS = 9000;

function signal() { return AbortSignal.timeout(TIMEOUT_MS); }

// ── 1. Brave Search API ───────────────────────────────────────────────────────

async function searchBrave(
  query: string,
  type: "web" | "discussions" | "news" = "web",
  count = 10,
): Promise<SearchResponse | null> {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) return null;

  const endpoint = type === "discussions"
    ? "https://api.search.brave.com/res/v1/web/search"   // use web + filter for discussions
    : type === "news"
      ? "https://api.search.brave.com/res/v1/news/search"
      : "https://api.search.brave.com/res/v1/web/search";

  const params = new URLSearchParams({ q: query, count: String(count) });
  if (type === "discussions") params.set("result_filter", "discussions");

  const res = await fetch(`${endpoint}?${params}`, {
    headers: {
      "Accept":              "application/json",
      "Accept-Encoding":     "gzip",
      "X-Subscription-Token": key,
    },
    signal: signal(),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;

  const data = await res.json() as {
    web?: { results?: Array<{ title: string; url: string; description: string; page_age?: string }> };
    results?: Array<{ title: string; url: string; description: string; age?: string }>;
    discussions?: { results?: Array<{ title: string; url: string; description: string }> };
  };

  const rawResults =
    (type === "discussions" ? data.discussions?.results : null) ??
    data.web?.results ??
    data.results ??
    [];

  const results: SearchResult[] = rawResults
    .filter(r => r.title && r.url)
    .slice(0, count)
    .map(r => ({
      title:       r.title,
      url:         r.url,
      snippet:     r.description ?? "",
      age:         (r as { page_age?: string; age?: string }).page_age ?? (r as { age?: string }).age,
      source_type: type === "discussions" ? "discussion" : type === "news" ? "news" : "web",
    }));

  if (results.length === 0) return null;
  return { results, provider: "brave", scraped: true, query };
}

// ── 2. Tavily ─────────────────────────────────────────────────────────────────

async function searchTavily(
  query: string,
  searchDepth: "basic" | "advanced" = "basic",
  maxResults = 8,
): Promise<SearchResponse | null> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) return null;

  const res = await fetch("https://api.tavily.com/search", {
    method:  "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth:        searchDepth,
      max_results:         maxResults,
      include_answer:      false,
      include_raw_content: false,
    }),
    signal: signal(),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;

  const data = await res.json() as {
    results?: Array<{ title: string; url: string; content: string; published_date?: string }>;
  };

  const results: SearchResult[] = (data.results ?? [])
    .filter(r => r.title && r.url)
    .slice(0, maxResults)
    .map(r => ({
      title:       r.title,
      url:         r.url,
      snippet:     r.content?.slice(0, 300) ?? "",
      age:         r.published_date,
      source_type: "web",
    }));

  if (results.length === 0) return null;
  return { results, provider: "tavily", scraped: true, query };
}

// ── 3. DDG lite scrape ────────────────────────────────────────────────────────

async function searchDDG(query: string): Promise<SearchResponse | null> {
  const encoded = encodeURIComponent(query);
  const res = await fetch(`https://lite.duckduckgo.com/lite/?q=${encoded}`, {
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" },
    signal: signal(),
  });
  if (!res.ok) return null;

  const html = await res.text();
  if (!html.includes("result-link") && !html.includes("uddg=")) return null;

  const linkMatches   = [...html.matchAll(/class="result-link"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippetMatches = [...html.matchAll(/class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi)];

  const results: SearchResult[] = [];
  for (let i = 0; i < Math.min(linkMatches.length, 8); i++) {
    const href = linkMatches[i]?.[1] ?? "";
    const rawTitle = (linkMatches[i]?.[2] ?? "").replace(/<[^>]+>/g, "").trim();
    const rawSnippet = (snippetMatches[i]?.[1] ?? "").replace(/<[^>]+>/g, "").trim();
    let url = href;
    if (href.includes("uddg=")) {
      const match = href.match(/uddg=([^&]+)/);
      if (match?.[1]) url = decodeURIComponent(match[1]);
    }
    if (!url.startsWith("http") || !rawTitle) continue;
    results.push({ title: rawTitle, url, snippet: rawSnippet, source_type: "web" });
  }

  if (results.length === 0) return null;
  return { results, provider: "ddg", scraped: true, query };
}

// ── 4. Serper (Google) ────────────────────────────────────────────────────────

async function searchSerper(
  query: string,
  type: "search" | "news" = "search",
  num = 10,
): Promise<SearchResponse | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) return null;

  const res = await fetch(`https://google.serper.dev/${type}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body:    JSON.stringify({ q: query, num }),
    signal:  signal(),
  });

  if (res.status === 429 || res.status === 401 || res.status === 403) return null;
  if (!res.ok) return null;

  const data = await res.json() as {
    organic?: Array<{ title: string; link: string; snippet: string; date?: string }>;
    news?:    Array<{ title: string; link: string; snippet: string; date?: string }>;
  };

  const raw = type === "news" ? (data.news ?? []) : (data.organic ?? []);
  const results: SearchResult[] = raw
    .filter(r => r.title && r.link)
    .slice(0, num)
    .map(r => ({
      title:       r.title,
      url:         r.link,
      snippet:     r.snippet ?? "",
      age:         r.date,
      source_type: type === "news" ? "news" : "web",
    }));

  if (results.length === 0) return null;
  return { results, provider: "serper", scraped: true, query };
}

// ── 5. AI synthesis fallback ──────────────────────────────────────────────────

async function synthesiseWithAI(query: string): Promise<SearchResponse> {
  try {
    const { callModelJSON, hasAIProvider } = await import("@/lib/ai-providers");
    if (!hasAIProvider()) return { results: [], provider: "none", scraped: false, query };

    interface AIResult {
      results?: Array<{ title: string; url: string; snippet: string }>;
    }

    const data = await callModelJSON<AIResult>(
      [{
        role: "system",
        content: `You are a market research assistant. Given a search query, list up to 6 real, known companies, products, communities, or resources that are relevant. Include real URLs where you are confident they exist. Return ONLY valid JSON: { "results": [{ "title": string, "url": string, "snippet": string }] }. Never invent URLs — use well-known domains only.`,
      }, {
        role: "user",
        content: `Search query: ${query.slice(0, 400)}`,
      }],
      { maxTokens: 600 },
    );

    const results: SearchResult[] = (data?.results ?? [])
      .filter(r => r.title && r.url)
      .slice(0, 6)
      .map(r => ({ ...r, source_type: "web" as const }));

    return { results, provider: "ai_synthesised", scraped: false, query };
  } catch {
    return { results: [], provider: "none", scraped: false, query };
  }
}

// ── Waterfall orchestrators ───────────────────────────────────────────────────

/**
 * webSearch — general web search.
 * Priority: Brave → Tavily → DDG → Serper → AI synthesis
 */
export async function webSearch(query: string, count = 10): Promise<SearchResponse> {
  const attempts: Array<() => Promise<SearchResponse | null>> = [
    () => searchBrave(query, "web", count),
    () => searchTavily(query, "basic", count),
    () => searchDDG(query),
    () => searchSerper(query, "search", count),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result && result.results.length > 0) return result;
    } catch { /* fall through */ }
  }

  return synthesiseWithAI(query);
}

/**
 * discussionSearch — surfaces Reddit/HN/forum posts about a problem.
 * Priority: Brave discussions → Tavily → DDG (reddit:) → Serper (reddit:) → AI synthesis
 * Critical for Validation Agent — this is where real user pain signals live.
 */
export async function discussionSearch(query: string, count = 10): Promise<SearchResponse> {
  const redditQuery = `${query} site:reddit.com OR site:news.ycombinator.com`;

  const attempts: Array<() => Promise<SearchResponse | null>> = [
    () => searchBrave(query, "discussions", count),
    () => searchTavily(`${query} reddit forum community discussion`, "basic", count),
    () => searchDDG(redditQuery),
    () => searchSerper(redditQuery, "search", count),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result && result.results.length > 0) return result;
    } catch { /* fall through */ }
  }

  return synthesiseWithAI(`${query} user pain points community complaints`);
}

/**
 * newsSearch — recent news and competitor launches.
 * Priority: Brave news → Tavily → Serper news → DDG → AI synthesis
 */
export async function newsSearch(query: string, count = 8): Promise<SearchResponse> {
  const attempts: Array<() => Promise<SearchResponse | null>> = [
    () => searchBrave(query, "news", count),
    () => searchTavily(`${query} recent news 2024 2025`, "basic", count),
    () => searchSerper(query, "news", count),
    () => searchDDG(`${query} news`),
  ];

  for (const attempt of attempts) {
    try {
      const result = await attempt();
      if (result && result.results.length > 0) return result;
    } catch { /* fall through */ }
  }

  return synthesiseWithAI(`${query} recent developments news`);
}

/**
 * competitorSearch — finds competitors, ProductHunt listings, and market alternatives.
 * Runs two parallel queries (direct + broad) and deduplicates.
 */
export async function competitorSearch(
  startupTitle: string,
  problem: string,
): Promise<SearchResponse> {
  const directQuery  = `${startupTitle} ${problem} competitors alternatives site:producthunt.com OR site:crunchbase.com`;
  const broadQuery   = `${problem} startup tool software best alternatives`;

  const [direct, broad] = await Promise.allSettled([
    webSearch(directQuery, 8),
    webSearch(broadQuery, 8),
  ]);

  const directResults  = direct.status  === "fulfilled" ? direct.value.results  : [];
  const broadResults   = broad.status   === "fulfilled" ? broad.value.results   : [];
  const provider       = direct.status  === "fulfilled" ? direct.value.provider : "none";

  // Deduplicate by URL
  const seen = new Set<string>();
  const merged: SearchResult[] = [];
  for (const r of [...directResults, ...broadResults]) {
    const key = r.url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
    if (!seen.has(key)) { seen.add(key); merged.push(r); }
  }

  return {
    results:  merged.slice(0, 12),
    provider,
    scraped:  provider !== "ai_synthesised" && provider !== "none",
    query:    directQuery,
  };
}
