/**
 * app/api/ai/score-rebuttal/route.ts
 *
 * Scores how well a founder defended against a Break My Startup attack.
 * Returns a 0-100 score, a short adversary counter-response, and a flag
 * indicating whether the defense actually addressed the core claim.
 *
 * IMPROVEMENTS vs previous version:
 *  1. Added plan gate — this is a builder-only feature (fixes audit M3).
 *  2. Added core-claim check: the adversary now explicitly evaluates whether
 *     the defense addressed the actual attack, not just sounded confident.
 *  3. Returns adversary_counter so the UI can show what the adversary says
 *     back — making the rebuttal feel like a real debate, not a scoring widget.
 *
 * Security: requires builder plan via checkPlanAccess() AND authenticated
 * session. Usage is tracked against the user's AI limit.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkPlanAccess } from "@/app/api/ai/_planCheck";
import { groqJSON, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";

export async function POST(req: NextRequest) {
  // ── Plan gate (builder-only) ────────────────────────────────────────────────
  const planCheck = await checkPlanAccess("builder");
  if (!planCheck.ok) return planCheck.response;

  // ── Usage enforcement ──────────────────────────────────────────────────────
  try {
    await enforceAndTrackAIUsage(planCheck.userId, planCheck.plan);
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

You MUST first determine whether the defense actually addresses the CORE CLAIM of the attack.
A defense that sounds confident but deflects to a different point scores no higher than 40.

Score the founder's defense from 0-100 based on:
- Core claim addressed (40 pts): Does the defense directly counter the specific attack made?
  If the attack is "your CAC is too high" and the defense is "we have great retention", that does NOT address the core claim.
- Evidence quality (25 pts): Data, examples, or specific plans vs vague assertions.
- Honesty (20 pts): Acknowledges valid parts of the attack rather than dismissing it entirely.
- Strategy (15 pts): Concrete next steps, not optimism.

Then write a 1-2 sentence adversary counter-response. If the core claim was not addressed, the
adversary should call this out directly. If the defense was strong, the adversary concedes partially
but finds the next weakness.

Respond ONLY as JSON:
{
  "score": <number 0-100>,
  "core_claim_addressed": <true|false>,
  "response": "<1-2 sentence adversary counter-response>",
  "weak_point": "<one word or phrase — the biggest gap in the defense, or null if strong>"
}`;

    const userPrompt = `ATTACK:
Title: ${attack.title}
Body: ${attack.body}

FOUNDER'S DEFENSE:
${defense}

First check: does the defense directly address the core claim of this specific attack?
Then score and respond as the adversary.`;

    const parsed = await groqJSON<{
      score: number;
      core_claim_addressed: boolean;
      response: string;
      weak_point: string | null;
    }>(systemPrompt, userPrompt);

    return NextResponse.json({
      score: Math.min(100, Math.max(0, parsed.score ?? 50)),
      core_claim_addressed: parsed.core_claim_addressed ?? true,
      response: parsed.response ?? "",
      weak_point: parsed.weak_point ?? null,
      // adversary_counter is the field the UI displays in the rebuttal card
      adversary_counter: parsed.response ?? "",
    });
  } catch (e: unknown) {
    if (process.env.NODE_ENV === "development") console.error("score-rebuttal error:", e);
    return NextResponse.json({
      score: 50,
      core_claim_addressed: true,
      response: "Interesting. I'll let that slide.",
      adversary_counter: "Interesting. I'll let that slide.",
      weak_point: null,
    });
  }
}
