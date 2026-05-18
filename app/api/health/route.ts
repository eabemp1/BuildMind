import { NextResponse } from "next/server";
import { hasAIProvider } from "@/lib/ai-providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight health check for uptime monitoring (UptimeRobot, Render, etc.).
 * Returns 200 when the app is running and provider config is detected.
 * Returns 503 if a critical dependency is misconfigured.
 *
 * Checks:
 *   - AI provider key configured (Groq / Cerebras / Gemini)
 *   - Supabase URL env var present
 *
 * Intentionally does NOT make live DB or AI calls — this endpoint is polled
 * every 60s and must be fast (<5ms). Use /api/system/env-status for deep checks.
 */
export async function GET() {
  const checks = {
    ai_provider: hasAIProvider(),
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  };

  const allHealthy = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    {
      status: allHealthy ? 200 : 503,
      headers: {
        // Never cache — always a fresh read
        "Cache-Control": "no-store",
      },
    },
  );
}
