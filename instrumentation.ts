/**
 * instrumentation.ts — Next.js startup hook
 *
 * Runs once per process start (both Node.js and Edge runtime).
 * Used to validate environment variables before any request is served,
 * so misconfigurations surface immediately with a clear message.
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run env validation on the Node.js runtime (not Edge).
  // Edge runtime has restricted module access.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env");
    validateEnv();
  }
}
