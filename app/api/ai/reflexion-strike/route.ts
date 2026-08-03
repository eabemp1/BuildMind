/**
 * app/api/ai/reflexion-strike/route.ts — Onboarding Reflexion Strike
 *
 * Playbook §2.1, Screen 2:
 * One-sentence startup description → market gap + first task in ~15 seconds.
 * This single interaction proves what BuildMind is faster than any explanation.
 *
 * Security:
 *   - Requires authenticated Supabase session (401 if not logged in)
 *   - Per-user usage tracking via enforceAndTrackAIUsage (same system as
 *     today-action and other gated routes)
 *   - Input length capped at 500 chars to prevent prompt-injection via large payloads
 */
import { NextResponse } from "next/server";
import { runReflexionStrike } from "@/lib/reflexion";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { classifyFounderArchetype } from "@/lib/founderArchetype";

export async function POST(req: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Usage enforcement ──────────────────────────────────────────────────────
  try {
    await enforceAndTrackAIUsage(routeUser.userId);
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json(
        { ok: false, error: msg, upgradeUrl: "/upgrade" },
        { status: 429 },
      );
    }
    // DB unavailable — allow through (graceful degradation)
  }

  try {
    const body = await req.json().catch(() => ({}));
    const startupDescription = body.startupDescription ?? body.idea ?? "";
    const { stage = "Idea", domain = "" } = body;

    if (!startupDescription?.trim()) {
      return NextResponse.json({ ok: false, error: "startupDescription required" }, { status: 400 });
    }

    // ARCHETYPE FIX: this used to only happen via /api/ai/onboarding-insight,
    // which no page in the app actually calls — so classification never ran
    // until the evening-check cron picked the founder up, up to 7 days later
    // and only if they'd accumulated enough behavioral signal. Firing it here
    // (fire-and-forget, doesn't block the response) means every founder gets
    // an archetype within their first ~15 seconds in the product, which is
    // what makes it worth surfacing prominently in the UI at all.
    classifyFounderArchetype(
      String(startupDescription).slice(0, 500),
      String(stage),
      String(domain),
      routeUser.userId,
    ).catch((err) => {
      console.error("[reflexion-strike] archetype classification failed:", err);
    });

    const result = await runReflexionStrike(
      String(startupDescription).slice(0, 500),
      String(stage),
      String(domain)
    );

    return NextResponse.json({ ok: true, data: result });
  } catch {
    // Graceful fallback — never show an error to a new user
    return NextResponse.json({
      ok: true,
      data: {
        marketGap: "The crowded part of this market is generic solutions. The gap nobody has claimed yet is serving your exact type of user with deep specificity.",
        firstTask: "Find one person who has this problem. Send them a message in the next 30 minutes asking what they currently do about it.",
        rationale: "Because talking to one real person beats a week of planning every time.",
      },
      fallback: true,
    });
  }
}
