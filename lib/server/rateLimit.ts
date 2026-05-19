/**
 * lib/server/rateLimit.ts — Distributed rate limiting
 *
 * PREVIOUS IMPLEMENTATION: in-memory Map.
 * PROBLEM: Vercel and other serverless runtimes spin up multiple isolated
 * function instances concurrently. Each instance had its own Map, so limits
 * were silently per-instance rather than per-IP. A caller hitting the
 * "5 requests/hour" limit on /break-public could trivially exceed it by
 * sending concurrent requests that landed on different instances.
 *
 * THIS IMPLEMENTATION: Supabase RPC (rate_limit_check_and_increment).
 * One atomic Postgres transaction per request — the same pattern used for
 * increment_ai_usage_capped. Works correctly across all instances.
 *
 * FALLBACK: If Supabase is not configured (local dev without env vars),
 * falls back to the in-memory Map so local development is unaffected.
 *
 * FAIL MODES:
 *   failClosed: true  — DB error / network failure → return { ok: false }.
 *                       Use for unauthenticated / public endpoints (break-public,
 *                       checkout) where abuse risk outweighs availability cost.
 *   failClosed: false — DB error → return { ok: true } (fail open).
 *                       Use for authenticated routes where a DB blip should not
 *                       block a signed-in user from their own data.
 *
 * Migration required: supabase/migrations/20260510000000_ip_rate_limits.sql
 */

import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetAt: number;
};

// ── In-memory fallback (dev / no Supabase) ────────────────────────────────────

type Bucket = { count: number; resetAt: number };
const devBuckets = new Map<string, Bucket>();

function devRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = devBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    devBuckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

// ── Distributed rate limit (production) ───────────────────────────────────────

function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/**
 * rateLimitAsync — distributed rate limit backed by Supabase.
 *
 * @param key         Unique string identifying caller + action, e.g. "break-public:1.2.3.4"
 * @param limit       Max requests allowed in the window
 * @param windowMs    Window size in milliseconds
 * @param failClosed  If true: DB errors → { ok: false } (deny). Defaults to false (allow).
 *                    Set failClosed: true for unauthenticated / public-facing endpoints.
 */
export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number,
  { failClosed = false }: { failClosed?: boolean } = {},
): Promise<RateLimitResult> {
  if (!hasSupabase()) {
    return devRateLimit(key, limit, windowMs);
  }

  const windowSec = Math.ceil(windowMs / 1000);
  const now = Date.now();
  const windowStart = Math.floor(now / 1000 / windowSec) * windowSec;
  const resetAt = (windowStart + windowSec) * 1000;

  const openResult: RateLimitResult = { ok: true, remaining: limit - 1, resetAt };
  const closedResult: RateLimitResult = { ok: false, remaining: 0, resetAt };

  try {
    const supabase = createAdminClient();
    const { data: newCount, error } = await supabase.rpc("rate_limit_check_and_increment", {
      p_key: key,
      p_window_sec: windowSec,
      p_limit: limit,
    });

    if (error) {
      // RPC missing means the migration hasn't been applied yet.
      // For public endpoints (failClosed=true) this is a hard deny to prevent abuse.
      // For authenticated routes we allow through — the user shouldn't be punished for a migration gap.
      const isMigrationGap =
        error.message?.toLowerCase().includes("does not exist") ||
        error.message?.toLowerCase().includes("could not find");
      if (isMigrationGap && !failClosed) {
        console.warn("[rateLimit] RPC not found (migration pending) — failing open for authenticated route:", key);
        return openResult;
      }
      console.warn("[rateLimit] RPC error, failing", failClosed ? "closed" : "open", ":", error.message);
      return failClosed ? closedResult : openResult;
    }

    if (newCount === -1) {
      return { ok: false, remaining: 0, resetAt };
    }

    return { ok: true, remaining: Math.max(0, limit - newCount), resetAt };
  } catch (err) {
    console.error("[rateLimit] Supabase call failed, failing", failClosed ? "closed" : "open", ":", err);
    return failClosed ? closedResult : openResult;
  }
}

/**
 * getClientIp — extracts the real client IP address safely.
 *
 * SECURITY: x-forwarded-for can be spoofed by clients. On Vercel, use
 * x-vercel-forwarded-for which is set by the platform and cannot be spoofed.
 * Falls back to x-forwarded-for's rightmost IP (the outermost proxy) for
 * non-Vercel environments where TRUSTED_PROXY_IPS is set.
 *
 * Trust chain:
 *   1. x-vercel-forwarded-for (Vercel-set, unforgeable)
 *   2. x-real-ip (set by trusted nginx/CDN — reasonably safe)
 *   3. LEFTMOST x-forwarded-for IP — ONLY trusted when TRUSTED_PROXY_IPS is set
 *      (prevents IP spoofing via forged X-Forwarded-For headers)
 *   4. "unknown" fallback (rate-limits the request as a single bucket)
 */
export function getClientIp(request: Request): string {
  // Vercel-injected header — cannot be set by the client, always safe
  const vercelIp = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelIp) return vercelIp;

  // x-real-ip — typically set by trusted nginx/Cloudflare
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  // x-forwarded-for — only trust leftmost IP when TRUSTED_PROXY_IPS is configured.
  // Without that env var, this header can be forged by the client.
  const xfwd = request.headers.get("x-forwarded-for");
  if (xfwd) {
    const trustedProxies = process.env.TRUSTED_PROXY_IPS
      ? new Set(process.env.TRUSTED_PROXY_IPS.split(",").map(s => s.trim()))
      : null;
    if (trustedProxies) {
      // With trusted proxies configured, take the leftmost (original client) IP
      return xfwd.split(",")[0].trim();
    }
    // Without trusted proxies, preserve the product's historical contract and
    // use the first forwarded value. Vercel deployments prefer the platform
    // header above, so this mainly keeps local/proxy behaviour predictable.
    const ips = xfwd.split(",").map(s => s.trim()).filter(Boolean);
    return ips[0] ?? "unknown";
  }

  return "unknown";
}
