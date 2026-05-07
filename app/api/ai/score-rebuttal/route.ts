/**
 * app/api/ai/score-rebuttal/route.ts
 *
 * Scores how well a founder defended against a Break My Startup attack.
 * Returns a 0-100 score and a short response from the adversary.
 *
 * Security: requires authenticated session via getCurrentUser() — which reads
 * from the Supabase server client (cookie-backed JWT), not from request body.
 * Usage is tracked against the user's monthly AI limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/projects";
import { groqJSON, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ── Usage enforcement ──────────────────────────────────────────────────────
  try {
    await enforceAndTrackAIUsage(user.id);
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json({ error: msg, upgradeUrl: "/upgrade" }, { status: 429 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const { attack, defense } = body;

  if (!attack || !defense) {
    return NextResponse.json({ error: "Missing attack or defense" }, { status: 400 });
  }

  try {
    const systemPrompt = `You are judging a rebuttal in a startup adversarial debate.
Score the founder's defense from 0-100 based on:
- Specificity (do they address the actual concern or hand-wave?)
- Evidence (do they cite data, examples, or just assert?)
- Honesty (do they acknowledge valid parts of the attack?)
- Strategy (do they have a concrete plan, or just optimism?)

Respond ONLY as JSON: { "score": <number 0-100>, "response": "<1-2 sentence response from the adversary>" }`;

    const userPrompt = `ATTACK:
Title: ${attack.title}
Body: ${attack.body}

FOUNDER'S DEFENSE:
${defense}

Score this defense and respond as the adversary.`;

    const parsed = await groqJSON<{ score: number; response: string }>(systemPrompt, userPrompt);

    return NextResponse.json({
      score: Math.min(100, Math.max(0, parsed.score ?? 50)),
      response: parsed.response ?? "",
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV === "development") console.error("score-rebuttal error:", e);
    return NextResponse.json({ score: 50, response: "Interesting. I'll let that slide." });
  }
}
