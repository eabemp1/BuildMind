/**
 * lib/server/concurrency.ts
 *
 * C2 FIX: In-process concurrency limiter for the agent pipeline.
 *
 * PROBLEM: runAgentPipeline() fans out to 5 parallel AI provider calls, each
 * with up to a 25 s timeout. Without a concurrency gate, a burst of 20
 * simultaneous users causes 100 outbound AI requests in the same second,
 * instantly hitting provider rate limits and generating a cascade of 429s
 * that the provider retry logic makes worse by stacking retries.
 *
 * FIX: A simple in-memory semaphore allows MAX_CONCURRENT pipelines to run
 * simultaneously. Requests beyond that limit queue (FIFO) for up to
 * QUEUE_TIMEOUT_MS before failing with a 503.
 *
 * Limits chosen conservatively:
 *   MAX_CONCURRENT = 5   — 5 × 5 agents = 25 simultaneous outbound calls,
 *                          well within Groq/Cerebras free-tier limits.
 *   QUEUE_TIMEOUT_MS = 30_000 — matches the route maxDuration budget for
 *                          the calling route (break-my-startup = 60 s;
 *                          validate-idea = 30 s).
 *
 * NOTE: This is per-process. On Vercel each function invocation is isolated,
 * so the limit is per-container, not global. For true global rate limiting
 * at scale, use the QStash queue (lib/queue/index.ts). This limiter is a
 * defence-in-depth layer that protects against single-container bursts.
 */

const MAX_CONCURRENT   = 5;
const QUEUE_TIMEOUT_MS = 30_000;

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      const idx = waiters.indexOf(resolve);
      if (idx !== -1) waiters.splice(idx, 1);
      reject(new Error("AgentConcurrencyLimit: queue timeout — try again in a moment"));
    }, QUEUE_TIMEOUT_MS);

    waiters.push(() => {
      clearTimeout(timer);
      active++;
      resolve();
    });
  });
}

function release(): void {
  active--;
  const next = waiters.shift();
  if (next) next();
}

/**
 * withAgentConcurrencyLimit — wraps an async function with the semaphore.
 *
 * Usage:
 *   const result = await withAgentConcurrencyLimit(() => runAgentPipeline(ctx));
 *
 * Throws with status hint if the queue times out (caller should return 503).
 */
export async function withAgentConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Exposed for health-check / monitoring endpoints */
export function getAgentConcurrencyStats() {
  return { active, queued: waiters.length, max: MAX_CONCURRENT };
}
