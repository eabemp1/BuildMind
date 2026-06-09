/**
 * app/api/ai/reflect-synthesis/route.ts
 *
 * POST → reads the founder's last N reflection entries and returns a
 * single AI-generated synthesis: what their data *means* across time,
 * not a replay of the entries themselves.
 *
 * This is what was missing from the Reflect page. It had per-entry AI
 * causality (reflect-action) but no cross-time interpretation layer.
 * A founder could see 30 reflections and still not know what pattern
 * they were living inside.
 *
 * Called from app/reflect/page.tsx on page load when history.length >= 5.
 * Fire-and-forget from the client: if it fails the page still works.
 *
 * POST /api/ai/reflect-synthesis
 * Body: {
 *   history: Array<{
 *     outcome: "completed" | "blocked" | "partial" | "learned";
 *     note: string;
 *     confidence: number;   // 1-5
 *     daysAgo: number;      // how many days ago this entry was
 *   }>;
 *   stage: string;          // current startup stage
 *   streak: number;         // current daily streak
 * }
 *
 * Response: { data: { synthesis: string } }
 */

import { NextResponse } from "next/server";
import { groqJSON, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { logError } from "@/lib/server/logger";

import { z } from "zod";

const HistoryEntrySchema = z.object({
  outcome: z.enum(["completed", "blocked", "partial", "learned"]),
  note: z.string().max(2000).default(""),
  confidence: z.number().min(0).max(5),
  daysAgo: z.number().int().min(0).max(365),
});

const SynthesisInputSchema = z.object({
  history: z.array(HistoryEntrySchema).max(90),
  stage: z.string().max(100).default("idea"),
  streak: z.number().int().min(0).max(9999).default(0),
});

interface HistoryEntry {
  outcome: "completed" | "blocked" | "partial" | "learned";
  note: string;
  confidence: number;
  daysAgo: number;
}

interface SynthesisInput {
  history: HistoryEntry[];
  stage: string;
  streak: number;
}

interface SynthesisOutput {
  synthesis: string;
}

/**
 * Compute summary statistics from the history so the prompt is grounded
 * in numbers, not just prose.
 */
function summariseHistory(history: HistoryEntry[]): {
  completionRate: number;
  avgConfidence: number;
  blockedCount: number;
  dominantOutcome: string;
  confidenceTrend: "improving" | "declining" | "stable";
  recentNotes: string[];
} {
  if (history.length === 0) {
    return {
      completionRate: 0,
      avgConfidence: 3,
      blockedCount: 0,
      dominantOutcome: "unknown",
      confidenceTrend: "stable",
      recentNotes: [],
    };
  }

  const completed = history.filter(h => h.outcome === "completed" || h.outcome === "partial").length;
  const completionRate = Math.round((completed / history.length) * 100);

  const avgConfidence = Math.round(
    (history.reduce((sum, h) => sum + h.confidence, 0) / history.length) * 10
  ) / 10;

  const blockedCount = history.filter(h => h.outcome === "blocked").length;

  // Find dominant outcome
  const outcomeCounts = history.reduce((acc, h) => {
    acc[h.outcome] = (acc[h.outcome] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dominantOutcome = Object.entries(outcomeCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "completed";

  // Confidence trend: compare first half vs second half
  const mid = Math.floor(history.length / 2);
  const firstHalf = history.slice(0, mid);
  const secondHalf = history.slice(mid);
  const firstAvg = firstHalf.reduce((s, h) => s + h.confidence, 0) / (firstHalf.length || 1);
  const secondAvg = secondHalf.reduce((s, h) => s + h.confidence, 0) / (secondHalf.length || 1);
  const confidenceTrend =
    secondAvg - firstAvg > 0.4 ? "improving" :
    firstAvg - secondAvg > 0.4 ? "declining" :
    "stable";

  // Last 3 non-empty notes for the prompt
  const recentNotes = history
    .filter(h => h.note && h.note.trim().length > 0)
    .slice(-3)
    .map(h => `(${h.daysAgo}d ago, ${h.outcome}): "${h.note.slice(0, 120)}"`)

  return { completionRate, avgConfidence, blockedCount, dominantOutcome, confidenceTrend, recentNotes };
}

export async function POST(request: Request) {
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // Enforce AI usage limits — synthesis counts as one AI call
  try {
    await enforceAndTrackAIUsage(routeUser.userId);
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json(
        { success: false, error: msg, upgradeUrl: "/upgrade" },
        { status: 429 }
      );
    }
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = SynthesisInputSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request body", issues: parseResult.error.issues },
        { status: 400 }
      );
    }
    const body: SynthesisInput = parseResult.data;
    const { history, stage, streak } = body;

    if (!history || history.length < 5) {
      return NextResponse.json(
        { success: false, error: "Not enough history for synthesis (min 5 entries)" },
        { status: 400 }
      );
    }

    const stats = summariseHistory(history);

    const systemPrompt = `You are BuildMind, an execution intelligence layer for solo founders.
Your job is to read the founder’s reflection history and tell them directly — in second person — what their data MEANS. Not what happened, but what pattern they are living inside and what it implies for the next 2 weeks.

Rules:
- One paragraph maximum (3-4 sentences). No lists, no headers.
- Be specific: reference the actual numbers (completion rate, confidence trend, blockedCount).
- Name the pattern directly. Don't soften it.
- End with one forward-looking implication — what should change, or what they should double down on.
- Do NOT repeat what they already know ("you've completed X tasks"). Interpret it.
- CRITICAL: Write entirely in second person. Address the founder as "you"/"your" throughout. Never write "the founder", "they", or "their".
- Tone: direct, warm, like a trusted advisor speaking face-to-face. Not a coach giving a pep talk.
- Return JSON ONLY with key: synthesis`;

    const userPrompt = `REFLECTION HISTORY STATS (last ${history.length} reflections):
- Completion rate: ${stats.completionRate}%
- Average confidence: ${stats.avgConfidence}/5
- Blocked sessions: ${stats.blockedCount} out of ${history.length}
- Dominant outcome: ${stats.dominantOutcome}
- Confidence trend: ${stats.confidenceTrend}
- Current stage: ${stage}
- Current streak: ${streak} days

RECENT NOTES FROM FOUNDER:
${stats.recentNotes.length > 0 ? stats.recentNotes.join("\n") : "(no notes provided)"}

Synthesise what this pattern means and what it implies going forward.`;

    const fallbackSynthesis = buildFallbackSynthesis(stats, stage);

    let result: SynthesisOutput;
    try {
      result = await groqJSON<SynthesisOutput>(systemPrompt, userPrompt);
      if (!result?.synthesis || result.synthesis.trim().length < 20) {
        result = { synthesis: fallbackSynthesis };
      }
    } catch {
      result = { synthesis: fallbackSynthesis };
    }

    return NextResponse.json({ success: true, data: { synthesis: result.synthesis } });
  } catch (err) {
    logError("reflect-synthesis", err);
    return NextResponse.json(
      { success: false, error: "Failed to generate synthesis" },
      { status: 500 }
    );
  }
}

/**
 * buildFallbackSynthesis — deterministic fallback when the AI call fails.
 * Still useful — grounded in real stats rather than generic platitudes.
 */
function buildFallbackSynthesis(
  stats: ReturnType<typeof summariseHistory>,
  stage: string
): string {
  const { completionRate, avgConfidence, blockedCount, confidenceTrend } = stats;

  if (blockedCount >= 3) {
    return `You're hitting blockers repeatedly — ${blockedCount} blocked sessions in this window. At ${stage} stage, recurring blocks almost always mean the same root cause hasn't been named yet. Before your next action, write the blocker in one sentence and find someone who's solved it.`;
  }

  if (completionRate >= 70 && confidenceTrend === "improving") {
    return `Your completion rate is ${completionRate}% and your confidence is trending up — that's a compounding pattern. The risk at ${stage} stage is mistaking execution momentum for market validation. Make sure some of what you're completing is talking to real users, not just building.`;
  }

  if (completionRate >= 70 && confidenceTrend === "declining") {
    return `You're executing at ${completionRate}% completion — strong output — but your confidence is declining. That gap usually means you're doing the work but not seeing results yet. At ${stage} stage, that's often a signal to narrow scope, not add more tasks.`;
  }

  if (completionRate < 40) {
    return `A ${completionRate}% completion rate tells you the actions you're setting are too large or wrong for your current constraints. The fix isn't more discipline — it's smaller, more specific actions that fit your actual available time at ${stage} stage.`;
  }

  return `You're at ${completionRate}% completion with average confidence of ${avgConfidence}/5. The pattern suggests ${confidenceTrend === "stable" ? "steady, sustainable progress" : confidenceTrend === "improving" ? "growing momentum worth protecting" : "a dip that needs diagnosing before it compounds"} at ${stage} stage.`;
}
