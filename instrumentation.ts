/**
 * instrumentation.ts — Next.js startup hook
 *
 * Runs once per process start (both Node.js and Edge runtime).
 * Used to validate environment variables before any request is served,
 * so misconfigurations surface immediately with a clear message.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
      enableLogs: true,
      sendDefaultPii: false,
    });
  }

  // Only run env validation on the Node.js runtime (not Edge).
  // Edge runtime has restricted module access.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}

export const onRequestError = Sentry.captureRequestError;
