"use client";

/**
 * Tiny in-memory TTL cache for the app shell's background reads.
 *
 * The sidebar and top bar remount when you move between sections, and each
 * mount used to re-fire the same handful of requests. JS modules survive
 * client-side navigation, so a module-level map lets those reads happen once
 * per TTL instead of once per click. Concurrent callers share one request.
 * Nothing is persisted; a hard refresh starts clean.
 */

type Entry = { at: number; value?: unknown; pending?: Promise<unknown> };
const store = new Map<string, Entry>();

export function cachedRead<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit?.pending) return hit.pending as Promise<T>;
  if (hit && "value" in hit && now - hit.at < ttlMs) return Promise.resolve(hit.value as T);
  const pending = load().then(
    (value) => { store.set(key, { at: Date.now(), value }); return value; },
    (err) => { store.delete(key); throw err; },
  );
  store.set(key, { at: now, pending });
  return pending;
}

/** Drop one key (or everything) after a write that makes cached reads stale. */
export function invalidateRead(prefix?: string): void {
  if (!prefix) { store.clear(); return; }
  for (const k of Array.from(store.keys())) if (k.startsWith(prefix)) store.delete(k);
}
