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
import { publicBreakAllowed, recordCall } from "@/lib/server/aiBudget";
import { DIMENSION_GUIDE, computeSurvival, normalizeSignals, previewScore, previewSignals, weakestTest } from "@/lib/breakScore";

// FIX: this used to hit DDG lite directly with no fallback — DDG's HTML
// structure breaks often and returns junk/empty results with nothing to
// fall back to. Now delegates to lib/search.ts's waterfall, which tries
// Tavily first (reliable, structured) and only touches DDG as a last resort.
async function scrapeCompetitors(query: string): Promise<{ titles: string; scraped: boolean; links: { title: string; url: string }[] }> {
  try {
    const response = await webSearch(query, 4);
    const titles = response.results.map(r => r.title).filter(Boolean);
    const seen = new Set<string>();
    const links: { title: string; url: string }[] = [];
    for (const r of response.results) {
      try {
        const u = new URL(r.url);
        if (!/^https?:$/.test(u.protocol) || seen.has(u.hostname)) continue;
        seen.add(u.hostname);
        links.push({ title: String(r.title || u.hostname).slice(0, 90), url: u.toString() });
      } catch { /* skip bad url */ }
    }
    const scraped = response.scraped && titles.length > 0;
    return { titles: titles.length ? titles.join(", ") : "", scraped, links: scraped ? links.slice(0, 4) : [] };
  } catch { return { titles: "", scraped: false, links: [] }; }
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

    // Daily abuse caps: per IP (on top of the hourly limit above) and for the
    // whole public page. Past a cap, or when global AI load is high, visitors
    // still get the no-AI preview instead of an error. Anonymous traffic must
    // never be able to starve signed-in users of AI capacity.
    const dayLimit = await rateLimitAsync(`break-public-day:${getClientIp(request)}`, 12, 24 * 60 * 60 * 1000, { failClosed: true });
    const gate = dayLimit.ok ? await publicBreakAllowed() : { live: false, why: "daily_cap" as const };
    const live = gate.live;

    // Light competitor scan (skipped in preview mode — it spends search credits)
    const scrapeResult = live ? await scrapeCompetitors(`${idea} startup tool software`) : { titles: "", scraped: false, links: [] as { title: string; url: string }[] };
    const competitors = scrapeResult.titles;
    const competitors_scraped = scrapeResult.scraped;

    const systemPrompt = `You are a brutally honest startup advisor. Return ONLY valid JSON with exactly these keys:
{
  "verdict": "2-3 blunt sentences assessing this specific idea",
  "kill_reasons": ["reason 1 (specific, not generic)", "reason 2", "reason 3"],
  "survive_reasons": ["reason 1", "reason 2"],
  "brutal_advice": "the single most important thing to do right now — specific to this idea",
  "signals": { "problem_severity": 0-5, "target_clarity": 0-5, "demand_evidence": 0-5, "differentiation": 0-5, "reachability": 0-5, "monetization": 0-5, "feasibility": 0-5 },
  "differentiation_plan": ["specific edge 1", "how to position differently", "one action in 30 days"]
}

Rules:
- signals: ${DIMENSION_GUIDE}
  Do not output a percentage; the score is computed from these ratings. Different ideas must get different ratings.
- kill_reasons: must be SPECIFIC to this idea, not generic startup clichés
- brutal_advice: one concrete action, not platitudes
- differentiation_plan: reference the actual competitors if found
No preamble. No markdown. Only JSON.`;

    const userPrompt = `Idea: ${idea}
${users ? `Target users: ${users}` : ""}
${problem ? `Problem being solved: ${problem}` : ""}
${competitors ? `Similar products found online: ${competitors}` : "No similar products found in quick search."}

Analyze this startup idea ruthlessly. Be specific to what was described, not generic.`;

    const fallbackScore = previewScore(idea, users, problem);
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

    let result: typeof defaultResult & { weakest?: ReturnType<typeof weakestTest>; competitor_links?: { title: string; url: string }[] } = defaultResult;
    let aiOk = false;
    result = { ...defaultResult, weakest: weakestTest(previewSignals(idea, users, problem)) };
    if (live) try {
      await recordCall("public");
      const ai = await groqJSON<Omit<typeof defaultResult, "survival_probability"> & { signals?: unknown }>(systemPrompt, userPrompt);
      const signals = normalizeSignals(ai?.signals);
      if (ai?.verdict && ai?.kill_reasons?.length && signals) {
        aiOk = true;
        result = {
          verdict: ai.verdict,
          kill_reasons: ai.kill_reasons.slice(0, 4),
          survive_reasons: (ai.survive_reasons ?? []).slice(0, 3),
          brutal_advice: ai.brutal_advice,
          survival_probability: computeSurvival(signals, `${idea} ${users} ${problem}`),
          differentiation_plan: (ai.differentiation_plan ?? []).slice(0, 3),
          weakest: weakestTest(signals),
        };
      }
    } catch {
      // use default — still useful
    }

    if (aiOk && scrapeResult.links.length) result.competitor_links = scrapeResult.links;
    return NextResponse.json({ success: true, data: result, competitors_scraped, preview: !aiOk });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Analysis failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
