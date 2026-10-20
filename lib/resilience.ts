/**
 * lib/resilience.ts — the plain reliability tools: a deadline on every outside
 * call, bounded retries with jittered backoff for reads that are safe to repeat,
 * and "keep what worked" settling so one failing source never sinks the rest.
 */

export class TimeoutError extends Error { constructor(label: string, ms: number) { super(`${label} timed out after ${ms}ms`); this.name = "TimeoutError"; } }

export function withTimeout<T>(p: Promise<T>, ms: number, label = "call"): Promise<T> {
  let t: ReturnType<typeof setTimeout>;
  const timer = new Promise<never>((_, rej) => { t = setTimeout(() => rej(new TimeoutError(label, ms)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

/** Retries only when `retryable` says so. Never use for writes that are not idempotent. */
export async function retry<T>(fn: () => Promise<T>, opts: { tries?: number; baseMs?: number; retryable?: (e: unknown) => boolean; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const tries = Math.max(1, opts.tries ?? 3), base = opts.baseMs ?? 250;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) {
      last = e;
      if (i === tries - 1 || (opts.retryable && !opts.retryable(e))) break;
      await sleep(Math.round(base * 2 ** i * (0.5 + Math.random() / 2)));
    }
  }
  throw last;
}

/** Runs every task (limited concurrency); returns the values that succeeded and a count of what failed. */
export async function settleAll<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 3): Promise<{ ok: R[]; failed: number }> {
  const ok: R[] = []; let failed = 0; let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { ok.push(await fn(items[k])); } catch { failed++; } }
  }));
  return { ok, failed };
}
