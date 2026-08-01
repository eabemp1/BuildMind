/**
 * lib/queue/index.ts — Background job queue abstraction
 *
 * WHY THIS EXISTS:
 *   The evening cron batch (cursor-paginated at PAGE_SIZE=100) processes all
 *   users in a single Vercel Function invocation. At ~500+ concurrent users
 *   this will hit the 60s maxDuration wall and OOM. Cursor pagination is a
 *   band-aid, not a solution.
 *
 *   This module provides a thin queue abstraction that:
 *   1. In development / without QSTASH_TOKEN: runs jobs inline (no queue needed)
 *   2. With QSTASH_TOKEN: fans jobs out via Upstash QStash (HTTP-based durable queue)
 *
 *   QStash is the recommended queue for Vercel/Edge deployments:
 *   - No Redis needed (HTTP-based)
 *   - Automatic retries with exponential backoff
 *   - Dead-letter queue for failed jobs
 *   - Compatible with Supabase Edge Functions
 *
 * SETUP:
 *   1. Sign up at https://upstash.com → QStash → copy QSTASH_TOKEN
 *   2. Add to .env.local:
 *        QSTASH_TOKEN=your_token_here
 *        QSTASH_CURRENT_SIGNING_KEY=...   # from Upstash dashboard
 *        QSTASH_NEXT_SIGNING_KEY=...      # from Upstash dashboard
 *   3. Protect worker endpoints with verifyQStashSignature() below
 *
 * USAGE:
 *   // Enqueue a single user's evening check
 *   await queue.enqueue("evening-check", { userId, projectId });
 *
 *   // Fan out to multiple workers
 *   await queue.enqueueBatch("evening-check", users.map(u => ({ userId: u.id })));
 *
 * SCALING PATH:
 *   Free tier:  10k messages/day → covers ~300 daily active users
 *   Pro tier:   500k messages/day → covers 15k+ DAU
 *
 * ALTERNATIVE:
 *   If you prefer Redis-backed queues, BullMQ + Upstash Redis is a drop-in
 *   replacement. Swap the `enqueue` implementation below.
 */

export interface QueueJob {
  [key: string]: unknown;
}

export type QueueName = "evening-check" | "re-engage" | "morning-briefing" | "score-sync";

// Map queue names to Next.js API route paths (the worker endpoints)
const QUEUE_ROUTES: Record<QueueName, string> = {
  "evening-check":    "/api/cron/evening-check/worker",
  "re-engage":        "/api/cron/re-engage/worker",
  "morning-briefing": "/api/cron/morning-briefing/worker",
  "score-sync":       "/api/user/sync-project-score",
};

function getQStashToken(): string | undefined {
  return process.env.QSTASH_TOKEN;
}

function getAppUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Enqueue a single job.
 *
 * Falls back to a no-op warning log when QStash is not configured,
 * so the cron batch can still run inline without breaking.
 */
export async function enqueue(name: QueueName, payload: QueueJob): Promise<void> {
  const token = getQStashToken();
  if (!token) {
    // Dev / no-queue mode: log and return. The cron batch runs inline.
    console.warn(`[queue] QSTASH_TOKEN not set — job "${name}" not enqueued. Configure Upstash QStash to fan out at scale.`);
    return;
  }

  const workerPath = QUEUE_ROUTES[name];
  const workerUrl = `${getAppUrl()}${workerPath}`;

  const resp = await fetch(`https://qstash.upstash.io/v2/publish/${encodeURIComponent(workerUrl)}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      // Retry failed jobs up to 3 times with exponential backoff
      "Upstash-Retries": "3",
      // Optional: delay first attempt by 1s to let DB writes settle
      "Upstash-Delay": "1s",
    },
    body: JSON.stringify(payload),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`[queue] QStash enqueue failed for "${name}": ${resp.status} ${text}`);
  }
}

/**
 * Enqueue multiple jobs in a single QStash batch request.
 * More efficient than looping enqueue() — one HTTP call for N jobs.
 */
export async function enqueueBatch(name: QueueName, payloads: QueueJob[]): Promise<void> {
  if (payloads.length === 0) return;

  const token = getQStashToken();
  if (!token) {
    console.warn(`[queue] QSTASH_TOKEN not set — batch of ${payloads.length} "${name}" jobs not enqueued.`);
    return;
  }

  const workerPath = QUEUE_ROUTES[name];
  const workerUrl = `${getAppUrl()}${workerPath}`;

  const batch = payloads.map(payload => ({
    destination: workerUrl,
    headers: {
      "Content-Type": "application/json",
      "Upstash-Retries": "3",
    },
    body: JSON.stringify(payload),
  }));

  const resp = await fetch("https://qstash.upstash.io/v2/batch", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(batch),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`[queue] QStash batch enqueue failed for "${name}": ${resp.status} ${text}`);
  }
}

/**
 * Verify that an incoming request came from QStash.
 * Call this at the top of every worker endpoint that receives queue jobs.
 *
 * Returns true if the signature is valid (or if QSTASH is not configured,
 * allowing local dev to call workers directly).
 */
export async function verifyQStashSignature(req: Request, preReadBody?: string): Promise<boolean> {
  const currentKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextKey    = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!currentKey || !nextKey) {
    // A4 FIX: In production, missing signing keys must be a hard failure — not a
    // silent pass-through. A misconfigured/rotated key would otherwise leave all
    // worker endpoints completely unprotected (any HTTP client could trigger them).
    // In development/test, we allow through so local dev works without QStash.
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "[queue] QSTASH_CURRENT_SIGNING_KEY / QSTASH_NEXT_SIGNING_KEY are missing in production. " +
        "Worker endpoints are unprotected. Add the keys from your Upstash dashboard.",
      );
    }
    return true;
  }

  const signature = req.headers.get("Upstash-Signature");
  if (!signature) return false;

  // Use @upstash/qstash when available, otherwise fall back to manual HMAC check
  try {
    // Dynamic import so this file works without the package installed
    const { Receiver } = await import("@upstash/qstash");
    const receiver = new Receiver({ currentSigningKey: currentKey, nextSigningKey: nextKey });
    // FIX: previously always called req.text() itself. Every real caller
    // (the three cron workers) ALSO needs the raw body for their own
    // payload parsing, and a Request body stream can only be consumed
    // once — a second req.text() call after the first would throw or
    // return empty, silently breaking verification. Callers that already
    // read the body now pass it through explicitly.
    const body = preReadBody ?? await req.text();
    await receiver.verify({ signature, body });
    return true;
  } catch {
    return false;
  }
}

// Convenience default export
export const queue = { enqueue, enqueueBatch, verifyQStashSignature };
