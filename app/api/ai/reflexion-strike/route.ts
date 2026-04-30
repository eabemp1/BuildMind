/**
 * app/api/ai/reflexion-strike/route.ts — Onboarding Reflexion Strike
 *
 * Playbook §2.1, Screen 2:
 * One-sentence startup description → market gap + first task in ~15 seconds.
 * This single interaction proves what BuildMind is faster than any explanation.
 */
import { NextResponse } from "next/server";
import { runReflexionStrike } from "@/lib/reflexion";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const startupDescription = body.startupDescription ?? body.idea ?? "";
    const { stage = "Idea", domain = "" } = body;

    if (!startupDescription?.trim()) {
      return NextResponse.json({ ok: false, error: "startupDescription required" }, { status: 400 });
    }

    const result = await runReflexionStrike(
      String(startupDescription).slice(0, 500),
      String(stage),
      String(domain)
    );

    return NextResponse.json({ ok: true, data: result });
  } catch (e) {
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
