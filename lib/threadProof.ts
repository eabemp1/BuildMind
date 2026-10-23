/**
 * lib/threadProof.ts - count real replies on a founder's public post, by platform, without any login.
 * Reddit lives in lib/redditProof.ts. This adds Hacker News and dev.to, which both have open read APIs,
 * and routes any post link to the right checker. Same ownership trick everywhere: the post's author posts
 * a short code as a comment on their own post, which only that account can do; then BuildMind counts
 * the distinct other commenters. Indie Hackers has no public API, so it is not supported.
 * Parsers are pure and tested on fixtures; only the fetchers touch the network and any failure means
 * "unavailable" (the reflection falls back to ordinary proof).
 */

import { checkRedditThread, fetchRedditThread, parseRedditPostId, redditOwnershipCode, type RedditCheck, type RedditThread } from "@/lib/redditProof";

export type ThreadPlatform = "reddit" | "hn" | "devto";
export const PLATFORM_NAMES: Record<ThreadPlatform, string> = { reddit: "Reddit", hn: "Hacker News", devto: "dev.to" };

export type ThreadRef = { platform: "reddit" | "hn"; id: string; user?: undefined; slug?: undefined } | { platform: "devto"; user: string; slug: string; id?: undefined };

const DEVTO_RESERVED = new Set(["t", "tags", "api", "search", "settings", "dashboard", "listings", "videos", "podcasts", "about", "contact", "FAQ", "pod", "shop", "sponsors"]);

export function parseThreadUrl(raw: string): ThreadRef | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase();
  const reddit = parseRedditPostId(raw);
  if (reddit) return { platform: "reddit", id: reddit };
  if (host === "news.ycombinator.com" && u.pathname === "/item") {
    const id = u.searchParams.get("id") ?? "";
    return /^\d{1,12}$/.test(id) ? { platform: "hn", id } : null;
  }
  if (host === "dev.to" || host === "www.dev.to") {
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 2 && !DEVTO_RESERVED.has(parts[0]) && /^[a-z0-9_-]+$/i.test(parts[0]) && /^[a-z0-9_-]+$/i.test(parts[1])) return { platform: "devto", user: parts[0].toLowerCase(), slug: parts[1] };
  }
  return null;
}

const strip = (html: unknown) => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ");

/** Algolia's HN item: { author, children: [{ author, text, children }] }. */
export function parseHnItem(json: unknown): RedditThread | null {
  const j = json as { author?: unknown; children?: unknown } | null;
  const postAuthor = typeof j?.author === "string" ? j.author : "";
  if (!postAuthor || !Array.isArray(j?.children)) return null;
  const comments: RedditThread["comments"] = [];
  const walk = (list: unknown[], depth: number) => {
    if (depth > 12 || comments.length > 2000) return;
    for (const c of list as Array<{ author?: unknown; text?: unknown; children?: unknown }>) {
      if (!c || typeof c !== "object") continue;
      comments.push({ author: typeof c.author === "string" ? c.author : "", body: strip(c.text) });
      if (Array.isArray(c.children)) walk(c.children, depth + 1);
    }
  };
  walk(j!.children as unknown[], 0);
  return { postAuthor, comments };
}

/** dev.to: the article ({ user: { username } }) and its comments ([{ user: { username }, body_html, children }]). */
export function parseDevtoThread(article: unknown, comments: unknown): RedditThread | null {
  const a = article as { user?: { username?: unknown } } | null;
  const postAuthor = typeof a?.user?.username === "string" ? a.user.username : "";
  if (!postAuthor || !Array.isArray(comments)) return null;
  const out: RedditThread["comments"] = [];
  const walk = (list: unknown[], depth: number) => {
    if (depth > 12 || out.length > 2000) return;
    for (const c of list as Array<{ user?: { username?: unknown }; body_html?: unknown; children?: unknown }>) {
      if (!c || typeof c !== "object") continue;
      out.push({ author: typeof c.user?.username === "string" ? c.user.username : "", body: strip(c.body_html) });
      if (Array.isArray(c.children)) walk(c.children, depth + 1);
    }
  };
  walk(comments, 0);
  return { postAuthor, comments: out };
}

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "web:buildmind.live:v1 (verifying a founder's own post)", Accept: "application/json" }, signal: AbortSignal.timeout(4000), cache: "no-store" });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

export async function fetchThread(ref: ThreadRef): Promise<RedditThread | null> {
  if (ref.platform === "reddit") return fetchRedditThread(ref.id);
  if (ref.platform === "hn") return parseHnItem(await getJson(`https://hn.algolia.com/api/v1/items/${ref.id}`));
  const article = await getJson(`https://dev.to/api/articles/${ref.user}/${ref.slug}`) as { id?: unknown } | null;
  if (!article || typeof article.id !== "number") return null;
  return parseDevtoThread(article, await getJson(`https://dev.to/api/comments?a_id=${article.id}`));
}

export function threadKey(ref: ThreadRef): string {
  return ref.platform === "devto" ? `devto:${ref.user}/${ref.slug}` : `${ref.platform}:${ref.id}`;
}

export type ThreadVerdict = { status: "not_supported" } | { status: "unavailable"; platform: ThreadPlatform } | (RedditCheck & { platform: ThreadPlatform });

export async function verifyThreadProof(userId: string, url: string, fetcher: typeof fetchThread = fetchThread): Promise<ThreadVerdict> {
  const ref = parseThreadUrl(url);
  if (!ref) return { status: "not_supported" };
  const thread = await fetcher(ref);
  if (!thread) return { status: "unavailable", platform: ref.platform };
  return { ...checkRedditThread(thread, threadCode(userId, ref)), platform: ref.platform };
}

/** Reddit keeps its original code so codes already handed out still work. */
export function threadCode(userId: string, ref: ThreadRef): string {
  return ref.platform === "reddit" ? redditOwnershipCode(userId, ref.id) : redditOwnershipCode(userId, threadKey(ref));
}
