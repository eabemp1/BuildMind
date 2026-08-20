/**
 * app/api/admin/ai-provider-status/route.ts
 * GET → which AI providers are actually configured in THIS deployment,
 * and how many providers are in each role's chain (fast/reasoning/fallback).
 *
 * getAIProviderDiagnostics() already existed in lib/ai-providers.ts — it
 * just wasn't exposed anywhere checkable. This makes "is my redundancy
 * real or is my chain secretly one provider deep" a one-request answer
 * instead of something only visible after a failure happens and gets
 * logged.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProviderDiagnostics } from "@/lib/ai-providers";

export async function GET() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const diagnostics = getAIProviderDiagnostics();
  return NextResponse.json({
    ok: true,
    ...diagnostics,
    note: "reasoning chain (used by Today's Agent A/Critic/Agent C) needs at least 2 for real redundancy — Gemini is not reliably reachable without billing on file, so it doesn't count as real redundancy even if configured.",
  });
}
