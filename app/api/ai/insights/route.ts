/**
 * app/api/ai/insights/route.ts
 *
 * SSE streaming endpoint — generates 3–5 AI insight sentences from behavioral
 * data and streams them as server-sent events. Same streaming pattern as
 * today-action/stream/route.ts.
 *
 * On completion, writes the synthesised insights back to
 * founder_memory.last_insight so the insights page and reflect page can share
 * the same insight state.
 *
 * Event format:
 *   event: insight  — { index, type, text } for each insight as it's ready
 *   event: done     — { ok: true, count }
 *   event: error    — { message }
 */

import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type InsightItem = {
  type: "warning" | "positive" | "insight";
  text: string;
};

export async function POST(request: Request) {
  const encoder = new TextEncoder();
  const body = await request.json().catch(() => ({}));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const userResult = await getRouteUser();
        if (!userResult?.user) {
          controller.enqueue(encoder.encode(sse("error", { message: "Unauthorized" })));
          controller.close();
          return;
        }
        const userId = userResult.user.id;

        const {
          avoidanceZones = [],
          strengths = [],
          completionByDay = {},
          avgConfidenceByOutcome = {},
          topOverrideReason,
          totalTasksCompleted = 0,
          totalTasksShown = 0,
          metacriticSignal,
          stage = "Idea",
        } = body as {
          avoidanceZones?: string[];
          strengths?: string[];
          completionByDay?: Record<string, { completed: number; total: number }>;
          avgConfidenceByOutcome?: Record<string, number>;
          topOverrideReason?: string;
          totalTasksCompleted?: number;
          totalTasksShown?: number;
          metacriticSignal?: string;
          stage?: string;
        };

        const systemPrompt = `You are a startup execution analyst reviewing a founder's behavioral data from the last 30 days.
Your job is to surface 3-5 specific, named patterns — not generic advice.
Each insight must name WHAT is happening, WHY it matters for this stage, and WHAT to do about it.
Severity: "warning" for risks, "positive" for strong signals, "insight" for neutral observations.
Return ONLY a valid JSON array:
[
  { "type": "warning"|"positive"|"insight", "text": "specific observation max 30 words" },
  ...
]
No preamble. No markdown. Only the JSON array.`;

        const executionRate = totalTasksShown > 0
          ? Math.round((totalTasksCompleted / totalTasksShown) * 100)
          : null;

        const userPrompt = [
          `Stage: ${stage}`,
          avoidanceZones.length ? `Avoidance zones: ${avoidanceZones.join(", ")}` : "",
          strengths.length ? `Strengths: ${strengths.join(", ")}` : "",
          executionRate != null ? `Execution rate: ${executionRate}%` : "",
          topOverrideReason ? `Most common override reason: "${topOverrideReason}"` : "",
          metacriticSignal ? `Metacritic signal: "${metacriticSignal}"` : "",
          Object.keys(avgConfidenceByOutcome).length
            ? `Confidence by outcome: ${JSON.stringify(avgConfidenceByOutcome)}`
            : "",
        ].filter(Boolean).join("\n");

        // Fallback — generic but not stale/misleading
        const fallback: InsightItem[] = [
          { type: "insight", text: "Keep completing daily tasks — your behavioral model will sharpen with each session." },
          { type: "insight", text: "BuildMind tracks avoidance patterns, confidence trends, and execution rhythm over time." },
        ];

        let insights: InsightItem[] = fallback;

        try {
          const ai = await groqJSON<InsightItem[]>(systemPrompt, userPrompt);
          if (Array.isArray(ai) && ai.length >= 1) {
            insights = ai.slice(0, 5).map((item) => ({
              type: ["warning", "positive", "insight"].includes(item.type) ? item.type : "insight",
              text: String(item.text ?? "").slice(0, 200),
            })) as InsightItem[];
          }
        } catch {
          // use fallback
        }

        // Stream each insight as it "arrives" — small delays for progressive feel
        for (let i = 0; i < insights.length; i++) {
          controller.enqueue(encoder.encode(sse("insight", { index: i, ...insights[i] })));
          // Small stagger so the UI can animate them in
          await new Promise((r) => setTimeout(r, 120));
        }

        // Write synthesised insights back to founder_memory.last_insight
        if (hasAdminEnv() && insights.length > 0) {
          const synthesisText = insights.map((ins) => ins.text).join(" ");
          try {
            const supabase = createAdminClient();
            await supabase
              .from("founder_memory")
              .upsert({ user_id: userId, last_insight: synthesisText }, { onConflict: "user_id" });
          } catch {
            // Non-fatal — streaming is the primary deliverable
          }
        }

        controller.enqueue(encoder.encode(sse("done", { ok: true, count: insights.length })));
        controller.close();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "insights stream failed";
        controller.enqueue(encoder.encode(sse("error", { message: msg })));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
