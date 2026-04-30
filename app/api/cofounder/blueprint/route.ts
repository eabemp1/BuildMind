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
import { enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";

export async function POST(_request: Request) {
  // 🔒 Operator tier — not yet live. Returns 503 until Operator plan launches.
  return NextResponse.json(
    { ok: false, error: "CoFounder Blueprint Mode is coming in the Operator plan. Stay tuned.", tier: "operator" },
    { status: 503 }
  );
}
