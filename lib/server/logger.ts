/**
 * lib/server/logger.ts — Structured server-side error logging
 *
 * Centralises all error logging so it can be swapped for Sentry, BetterStack,
 * or Axiom with a single change here rather than touching 100+ call sites.
 *
 * Usage:
 *   import { logError, logWarn, generateRequestId } from "@/lib/server/logger";
 *   const requestId = generateRequestId();
 *   logError("coach", err, { userId, route: "/api/ai/coach", requestId });
 *
 * ── Request ID Tracing ─────────────────────────────────────────────────────
 * generateRequestId() creates a short UUID at route entry. Pass it through
 * every downstream agent/pipeline call so all log lines for one request share
 * the same ID. This makes debugging production AI pipeline failures 10x faster:
 * grep for a single requestId to see exactly which stage failed, which provider
 * was used, and what the context looked like.
 *
 * ── Sentry integration ────────────────────────────────────────────────────
 * Install @sentry/nextjs and set SENTRY_DSN.
 *   - userId    → Sentry user.id
 *   - route     → Sentry tag "route"
 *   - plan      → Sentry tag "plan"
 *   - requestId → Sentry tag "request_id" (links all events for one pipeline run)
 *   - All other meta keys → Sentry extras
 *
 * In production, set LOG_LEVEL=warn to suppress info noise.
 */

type Meta = Record<string, unknown>;

/**
 * generateRequestId — creates a short, URL-safe UUID for tracing one
 * request through all its pipeline stages and agent calls.
 *
 * Usage at route entry:
 *   const requestId = generateRequestId();
 *   logInfo("today-action/start", "Pipeline started", { userId, requestId });
 *   // pass requestId into every logError/logWarn call downstream
 */
export function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

function serialize(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return String(err); }
}

function emit(level: "error" | "warn" | "info", context: string, err: unknown, meta?: Meta) {
  const entry = {
    level,
    context,
    error: serialize(err),
    ...(meta ?? {}),
    ts: new Date().toISOString(),
  };

  // Sentry (optional)
  if (level === "error" && process.env.SENTRY_DSN) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require("@sentry/nextjs");
      Sentry.withScope((scope: {
        setUser: (u: { id: string }) => void;
        setTag: (k: string, v: string) => void;
        setExtra: (k: string, v: unknown) => void;
      }) => {
        if (typeof meta?.userId    === "string") scope.setUser({ id: meta.userId });
        if (typeof meta?.route     === "string") scope.setTag("route", meta.route);
        if (typeof meta?.plan      === "string") scope.setTag("plan",  meta.plan);
        if (typeof meta?.requestId === "string") scope.setTag("request_id", meta.requestId);
        Object.entries(meta ?? {}).forEach(([k, v]) => {
          if (!["userId","route","plan","requestId"].includes(k)) scope.setExtra(k, v);
        });
        Sentry.captureException(err instanceof Error ? err : new Error(serialize(err)));
      });
    } catch { /* Sentry not installed */ }
  }

  if (level === "error") {
    console.error(JSON.stringify(entry));
  } else if (level === "warn") {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export function logError(context: string, err: unknown, meta?: Meta) {
  emit("error", context, err, meta);
}

export function logWarn(context: string, msg: unknown, meta?: Meta) {
  emit("warn", context, msg, meta);
}

export function logInfo(context: string, msg: unknown, meta?: Meta) {
  emit("info", context, msg, meta);
}
