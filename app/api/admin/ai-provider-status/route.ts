/**
 * app/api/admin/ai-provider-status/route.ts
 * GET → which AI providers are actually configured in THIS deployment,
 * and how many providers are in each role's chain (fast/reasoning/fallback).
 * GET ?live=true → the same, plus a real ping to every configured
 * provider (checkAllProviders()) — actual reachability right now, not
 * just "is the env var set." Costs a handful of real tokens (5 tiny
 * calls), so it's opt-in via the query param rather than the default —
 * don't wire this into anything that runs on every page load.
 *
 * getAIProviderDiagnostics() already existed in lib/ai-providers.ts — it
 * just wasn't exposed anywhere checkable. This makes "is my redundancy
 * real or is my chain secretly one provider deep" a one-request answer
 * instead of something only visible after a failure happens and gets
 * logged. checkAllProviders() closes the other half of that same gap:
 * "configured" and "actually reachable right now" are different
 * questions — Cerebras's free tier ending, OpenRouter's pinned free
 * model dying, and Gemini's free tier 404oing (all documented in
 * lib/ai-providers.ts's PROVIDER STATUS header) each stayed
 * "configured: true" the whole time they were silently dead.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAIProviderDiagnostics, checkAllProviders } from "@/lib/ai-providers";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const diagnostics = getAIProviderDiagnostics();
  const wantsLive = new URL(req.url).searchParams.get("live") === "true";
  const live = wantsLive ? await checkAllProviders() : null;

  return NextResponse.json({
    ok: true,
    ...diagnostics,
    live,
    note: "reasoning chain (used by Today's Agent A/Critic/Agent C) needs at least 2 for real redundancy — Gemini is not reliably reachable without billing on file, so it doesn't count as real redundancy even if configured.",
  });
}
