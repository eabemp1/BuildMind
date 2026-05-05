/**
 * app/api/cofounder/blueprint/route.ts
 *
 * CoFounder Core — Blueprint Mode (Full Intelligence)
 *
 * Builder plan only. Extends BreakMyStartupAnalysis competitor data
 * with AI-enriched steal/skip/next-move intelligence + web search.
 * Consumes the BreakMyStartupAnalysis competitors[] array directly.
 */
/**
 * ⚠️  PLAYBOOK TIMING: CoFounder Blueprint Mode
 *
 * This route exists in the codebase ahead of its playbook unlock date.
 * Month 3 — competitor intelligence features.
 * Gate behind Ghost Competitor launch (20+ active users). Currently gated at builder as a safe interim.
 *
 * Current server-side guard: builder (safest interim gate — keeps it off free tier).
 * Do NOT remove the plan guard or surface this feature in UI until the condition above is met.
 */


import { NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage } from "@/app/api/ai/_utils";

export async function POST(request: Request) {
  try {
    const access = await checkPlanAccess("builder");
    if (!access.ok) {
      return access.response;
    }

    await enforceAndTrackAIUsage(access.userId);

    // TODO: restore full blueprint logic
    return NextResponse.json(
      { ok: false, error: "CoFounder Blueprint Mode is being finalized. Check back soon." },
      { status: 501 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "CoFounder Blueprint Mode failed";
    const status = message.toLowerCase().includes("limit") ? 429 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
