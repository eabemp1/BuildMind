/**
 * app/api/ai/_usageGate.ts
 *
 * One call every user-triggered AI route uses to spend the plan's AI
 * allowance. Returns a ready-made 429 response when the limit is reached
 * (callers just `if (blocked) return blocked;`), otherwise null.
 *
 * "core"    = the daily-action loop (Today, Reflect, onboarding analysis).
 * "general" = everything else (Coach, agents, recovery, calibration, ...).
 *
 * If the usage counters cannot be reached, free users get a 503 (never free,
 * uncounted AI); paid users are let through by enforceAndTrackAIUsage itself.
 */
import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, type AIUsageFeature } from "@/app/api/ai/_utils";
import { AIUsageUnavailableError } from "@/lib/server/aiUsageStore";

export function isLimitError(err: unknown): err is Error {
  return err instanceof Error && err.message.toLowerCase().includes("limit reached");
}

export async function gateAIUsage(userId: string, feature: AIUsageFeature = "general"): Promise<NextResponse | null> {
  try {
    await enforceAndTrackAIUsage(userId, undefined, feature);
    return null;
  } catch (err) {
    if (isLimitError(err)) {
      return NextResponse.json({ ok: false, success: false, error: err.message, upgradeUrl: "/upgrade" }, { status: 429 });
    }
    if (err instanceof AIUsageUnavailableError) {
      return NextResponse.json({ ok: false, success: false, error: err.message }, { status: 503 });
    }
    // Any other unexpected error: do not let the call through uncounted.
    return NextResponse.json({ ok: false, success: false, error: "AI usage check failed. Please try again." }, { status: 503 });
  }
}
