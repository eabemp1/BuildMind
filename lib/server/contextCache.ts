/**
 * lib/server/contextCache.ts — Request-scoped founder context cache
 *
 * PROBLEM: The reflexion pipeline (7 stages) and agent pipeline (5 agents)
 * both call getFounderContext() independently. Without caching, a single
 * "today's action" request makes 3–5 identical Supabase reads for the same
 * user's founder_context row. At scale this is unnecessary latency and quota.
 *
 * SOLUTION: A process-level TTL cache keyed by userId. The TTL is short
 * (15 seconds) — long enough to cover one request's pipeline, short enough
 * that writes from that same request (e.g. momentum updates) become visible
 * on the very next request.
 *
 * This is NOT a persistent cache. Each Vercel function instance has its own
 * Map. A cache miss just falls through to Supabase — correct, if slightly
 * slower. The win is on repeated reads within the same function invocation.
 *
 * Usage:
 *   import { withContextCache } from "@/lib/server/contextCache";
 *
 *   // In a data-fetching function:
 *   const ctx = await withContextCache(userId, () => fetchContextFromDB(userId));
 */

import type { FounderContext } from "@/lib/founderContext";

interface CacheEntry {
  data: FounderContext;
  expiresAt: number;
}

// Process-level Map — shared across all requests on the same function instance
const cache = new Map<string, CacheEntry>();

const TTL_MS = 15_000; // 15 seconds — covers one pipeline, expires before next request

/**
 * withContextCache — returns cached context if fresh, otherwise calls fetcher.
 *
 * @param userId   Supabase user ID (cache key)
 * @param fetcher  Async function that loads context from DB (only called on miss)
 */
export async function withContextCache(
  userId: string,
  fetcher: () => Promise<FounderContext | null>,
): Promise<FounderContext | null> {
  const now = Date.now();
  const existing = cache.get(userId);

  if (existing && existing.expiresAt > now) {
    return existing.data;
  }

  const fresh = await fetcher();

  if (fresh) {
    cache.set(userId, { data: fresh, expiresAt: now + TTL_MS });
  }

  return fresh;
}

/**
 * invalidateContextCache — call after writing to founder_context so the
 * next read gets the updated value. Called from routes that update context.
 */
export function invalidateContextCache(userId: string): void {
  cache.delete(userId);
}

/**
 * getContextCacheStats — for health checks / admin endpoints only.
 * Returns the number of cached entries and their remaining TTL.
 */
export function getContextCacheStats(): { size: number; entries: Array<{ userId: string; ttlRemainingMs: number }> } {
  const now = Date.now();
  const entries = [];
  for (const [userId, entry] of cache.entries()) {
    const ttlRemainingMs = entry.expiresAt - now;
    if (ttlRemainingMs > 0) {
      entries.push({ userId, ttlRemainingMs });
    } else {
      cache.delete(userId); // Lazy eviction
    }
  }
  return { size: entries.length, entries };
}
