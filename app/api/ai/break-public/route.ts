/**
 * app/api/ai/break-public/route.ts
 *
 * Public-safe Break My Startup endpoint — no userId/auth required.
 * Rate-limited by IP to prevent abuse (5 calls per IP per hour).
 * Used by /break landing page to deliver the viral entry experience.
 */

import { NextResponse } from "next/server";
import { groqJSON } from "@/app/api/ai/_utils";
import { getClientIp, rateLimitAsync } from "@/lib/server/rateLimit";
import { webSearch } from "@/lib/search";

function previewSignalScore(idea: string, users: string, problem: string): number {
  const words = idea.split(/\s+/).filter(Boolean).length;
  const hasUser = Boolean(users) || /\b(for|helps|founders|teams|students|businesses|users|customers|creators|developers)\b/i.test(idea);
  const hasProblem = Boolean(problem) || /\b(problem|struggle|pain|waste|slow|expensive|hard|difficult|manual|risk)\b/i.test(idea);
  const hasBusiness = /\b(pay|paid|revenue|subscription|pricing|sell|customer|market)\b/i.test(idea);
  const raw = 16 + Math.min(20, words * 0.5) + (hasUser ? 14 : 0) + (hasProblem ? 14 : 0) + (hasBusiness ? 10 : 0);
  return Math.min(82, Math.max(12, Math.round(raw)));
}

// FIX: this used to hit DDG lite directly with no fallback — DDG's HTML
// structure breaks often and returns junk/empty results with nothing to
// fall back to. Now delegates to lib/search.ts's waterfall, which tries
// Tavily first (reliable, structured) and only touches DDG as a last resort.
async function scrapeCompetitors(query: string): Promise<{ titles: string; scraped: boolean }> {
  try {
    const response = await webSearch(query, 4);
    const titles = response.results.map(r => r.title).filter(Boolean);
    return { titles: titles.length ? titles.join(", ") : "", scraped: response.scraped && titles.length > 0 };
  } catch { return { titles: "", scraped: false }; }
}

export async function POST(request: Request) {
  try {
    const limit = await rateLimitAsync(`break-public:${getClientIp(request)}`, 5, 60 * 60 * 1000, { failClosed: true });
    if (!limit.ok) {
      return NextResponse.json({ success: false, error: "Rate limit reached. Try again in an hour." }, { status: 429 });
    }

    const body = await request.json().catch(() => ({}));
    const idea    = String(body?.idea ?? "").trim().slice(0, 800);
    const users   = String(body?.targetUsers ?? "").trim().slice(0, 200);
    const problem = String(body?.problem ?? "").trim().slice(0, 400);

    if (!idea || idea.length < 10) {
      return NextResponse.json({ success: false, error: "Describe your startup idea (at least 10 characters)." }, { status: 400 });
    }

    // Light competitor scan
    const scrapeResult = await scrapeCompetitors(`${idea} startup tool software`);
    const competitors = scrapeResult.titles;
    const competitors_scraped = scrapeResult.scraped;

    const systemPrompt = `You are a brutally honest startup advisor. Return ONLY valid JSON with exactly these keys:
{
  "verdict": "2-3 blunt sentences assessing this specific idea",
  "kill_reasons": ["reason 1 (specific, not generic)", "reason 2", "reason 3"],
  "survive_reasons": ["reason 1", "reason 2"],
  "brutal_advice": "the single most important thing to do right now — specific to this idea",
  "survival_probability": <integer 5-95>,
  "differentiation_plan": ["specific edge 1", "how to position differently", "one action in 30 days"]
}

Rules:
- survival_probability: base on idea quality, market clarity, and execution signals. Be honest — most ideas are 20-45%.
- kill_reasons: must be SPECIFIC to this idea, not generic startup clichés
- brutal_advice: one concrete action, not platitudes
- differentiation_plan: reference the actual competitors if found
No preamble. No markdown. Only JSON.`;

    const userPrompt = `Idea: ${idea}
${users ? `Target users: ${users}` : ""}
${problem ? `Problem being solved: ${problem}` : ""}
${competitors ? `Similar products found online: ${competitors}` : "No similar products found in quick search."}

Analyze this startup idea ruthlessly. Be specific to what was described, not generic.`;

    const fallbackScore = previewSignalScore(idea, users, problem);
    const defaultResult = {
      verdict: "This idea has potential but significant execution risks. The market may be crowded and differentiation is unclear.",
      kill_reasons: [
        "No clear differentiation from existing solutions — what makes this 10x better?",
        "Target user definition is vague — unclear who pays and why they switch",
        "No evidence of validated demand — talking to users before building is critical",
      ],
      survive_reasons: [
        "The problem being solved is real and felt",
        "Founder clearly cares about the space",
      ],
      brutal_advice: "Talk to 5 potential customers this week — not to pitch, but to ask if they currently pay for anything to solve this problem and what they hate about it.",
      survival_probability: fallbackScore,
      differentiation_plan: [
        "Identify the #1 complaint users have with existing solutions and make that your core feature",
        "Price differently — not cheaper, but on a metric that aligns with customer value",
        "Pick one distribution channel and own it completely before diversifying",
      ],
    };

    let result = defaultResult;
    try {
      const ai = await groqJSON<typeof defaultResult>(systemPrompt, userPrompt);
      if (ai?.verdict && ai?.kill_reasons?.length && typeof ai.survival_probability === "number") {
        result = {
          verdict: ai.verdict,
          kill_reasons: ai.kill_reasons.slice(0, 4),
          survive_reasons: (ai.survive_reasons ?? []).slice(0, 3),
          brutal_advice: ai.brutal_advice,
          survival_probability: Math.min(95, Math.max(5, Math.round(ai.survival_probability))),
          differentiation_plan: (ai.differentiation_plan ?? []).slice(0, 3),
        };
      }
    } catch {
      // use default — still useful
    }

    return NextResponse.json({ success: true, data: result, competitors_scraped });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
