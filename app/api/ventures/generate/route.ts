/**
 * app/api/ventures/generate/route.ts
 *
 * BuildMind Ventures — Blueprint Generation API
 *
 * Accepts multi-modal input (text + optional image/screenshot) and returns
 * a structured StartupBlueprint across up to 8 layers depending on plan.
 *
 * Same auth pattern as /api/ai/coach.
 * Uses Anthropic Claude (claude-sonnet-4-5) for vision + reasoning.
 */
/**
 * ⚠️  PLAYBOOK TIMING: Ventures Blueprint Engine
 *
 * This route exists in the codebase ahead of its playbook unlock date.
 * Not in the Playbook 12-month roadmap as a named feature — treat as Month 3+ internal tooling.
 * Do not surface to users until Ghost Competitor (Month 3, 20+ active users) has proven the competitive intelligence value.
 *
 * Current server-side guard: builder (safest interim gate — keeps it off free tier).
 * Do NOT remove the plan guard or surface this feature in UI until the condition above is met.
 */


import { NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage } from "@/app/api/ai/_utils";

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    // Plan gate — builder required (lib/plan.ts FEATURE_GATES.venturesBlueprint)
    const access = await checkPlanAccess("builder");
    if (!access.ok) {
      return access.response;
    }

    await enforceAndTrackAIUsage(access.userId);

    // TODO: restore full blueprint generation logic from VENTURES_INTEGRATION.md
    // Returning 501 (not implemented) instead of 503 (service unavailable)
    // so the plan gate is exercised and builders see a clear "coming soon" vs "forbidden"
    return NextResponse.json(
      { ok: false, error: "Ventures Blueprint generation is being finalized. Check back soon." },
      { status: 501 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ventures Blueprint generation failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
