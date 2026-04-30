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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(_request: Request) {
  // 🔒 Operator tier — not yet live. Returns 503 until Operator plan launches.
  return NextResponse.json(
    { ok: false, error: "Ventures Blueprint is coming in the Operator plan. Stay tuned.", tier: "operator" },
    { status: 503 }
  );
}
