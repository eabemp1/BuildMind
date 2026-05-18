/**
 * lib/server/errorReporter.ts — Structured error reporting
 *
 * Wraps any configured error aggregator (Sentry via @sentry/nextjs when the
 * SENTRY_DSN env var is set) and always emits a structured JSON log line
 * regardless, so errors are never silently swallowed.
 *
 * Usage:
 *   import { reportError } from "@/lib/server/errorReporter";
 *   reportError(err, { route: "/api/ai/today-action", userId });
 *
 * Zero dependencies if SENTRY_DSN is not set — the dynamic import only runs
 * when the DSN is present, so the bundle is not affected for non-Sentry deploys.
 *
 * To enable Sentry:
 *   1. npm install @sentry/nextjs
 *   2. Add SENTRY_DSN=https://... to your env
 *   3. Follow Sentry's Next.js wizard for sentry.client.config.ts / server.config.ts
 */

export interface ErrorContext {
  route?: string;
  userId?: string;
  plan?: string;
  /** Any additional key-value metadata to attach */
  [key: string]: unknown;
}

const DSN = process.env.SENTRY_DSN?.trim();

/**
 * reportError — capture an error with structured context.
 *
 * - Always emits a JSON log line to stdout (visible in Vercel / Railway logs)
 * - Forwards to Sentry if SENTRY_DSN is configured
 * - Never throws — error reporting must not crash the caller
 */
export function reportError(err: unknown, context: ErrorContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const stack   = err instanceof Error ? err.stack  : undefined;

  // ── Structured log line (always) ─────────────────────────────────────────
  // JSON on one line so log aggregators (Datadog, Axiom, Logtail) can parse it.
  try {
    const logEntry: Record<string, unknown> = {
      level:   "error",
      ts:      new Date().toISOString(),
      message,
      ...context,
    };
    if (stack) logEntry.stack = stack.split("\n").slice(0, 6).join(" | ");
    console.error("[errorReporter]", JSON.stringify(logEntry));
  } catch {
    // JSON.stringify can throw on circular refs — fallback
    console.error("[errorReporter] failed to serialize:", message, context);
  }

  // ── Sentry (when DSN is configured) ──────────────────────────────────────
  if (DSN) {
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.withScope((scope) => {
          if (context.userId) scope.setUser({ id: context.userId });
          if (context.route)  scope.setTag("route", context.route);
          if (context.plan)   scope.setTag("plan", context.plan);
          Object.entries(context).forEach(([k, v]) => {
            if (k !== "userId" && k !== "route" && k !== "plan") {
              scope.setExtra(k, v);
            }
          });
          Sentry.captureException(err instanceof Error ? err : new Error(message));
        });
      })
      .catch(() => {
        // @sentry/nextjs not installed — no-op. The console log above already ran.
      });
  }
}

/**
 * withErrorBoundary — wraps an async function, captures any thrown error
 * to Sentry before re-throwing it. Use in AI pipeline calls so errors are
 * always captured with route + userId context even if the caller re-throws.
 *
 * Usage:
 *   const result = await withErrorBoundary(
 *     () => runAgentPipeline(ctx),
 *     { route: "/api/ai/break-my-startup", userId }
 *   );
 */
export async function withErrorBoundary<T>(
  fn: () => Promise<T>,
  context: ErrorContext = {},
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    reportError(err, context);
    throw err;
  }
}

/**
 * reportWarning — non-fatal structured warning.
 * Logged at warn level; sent to Sentry as a breadcrumb, not an exception.
 */
export function reportWarning(message: string, context: ErrorContext = {}): void {
  try {
    console.warn("[errorReporter]", JSON.stringify({ level: "warn", ts: new Date().toISOString(), message, ...context }));
  } catch {
    console.warn("[errorReporter] warn:", message);
  }
  if (DSN) {
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.addBreadcrumb({ level: "warning", message, data: context });
      })
      .catch(() => undefined);
  }
}
