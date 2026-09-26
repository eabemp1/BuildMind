/**
 * app/api/ai/insights/route.ts
 *
 * SSE streaming endpoint — generates 3-5 AI insight sentences from behavioral
 * data and streams them as server-sent events. Same streaming pattern as
 * today-action/stream/route.ts.
 *
 * ── Grounding (evidence attribution) ────────────────────────────────────
 * This used to just narrate the input stats into a prompt and trust
 * whatever sentences the model returned — no evidence trail, no way to
 * verify a claim, nothing to correct, unlike lib/founderMirror.ts's belief
 * cards. Now: every real fact in the input is assigned a stable key
 * (buildEvidenceMap below), the prompt lists those keys explicitly and
 * requires each insight to cite exactly one, and any insight whose cited
 * key doesn't resolve to a real fact — hallucinated key, or the model just
 * left it out — is DROPPED server-side rather than shown. The `evidence`
 * string attached to a surviving insight is the server's own precomputed
 * text for that key, not the model's paraphrase of it, so what's displayed
 * as "why" is guaranteed to match the real data even if the model's prose
 * above it oversells it.
 *
 * On completion, writes the synthesised (grounded-only) insights back to
 * founder_memory.last_insight so the insights page and reflect page can
 * share the same insight state.
 *
 * Event format:
 *   event: insight  — { index, type, text, basis, evidence } for each
 *                      insight as it's ready ("basis"/"evidence" are null
 *                      for the generic no-data fallback — see below)
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
  basis: string | null;
  evidence: string | null;
};

type InsightInput = {
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

/**
 * The one place a raw input stat becomes a citable, server-verified fact.
 * Every key here is independently true given the input — the model can
 * only ever point at one of these, never invent one, and the display text
 * for a matched key comes from here, not from the model.
 */
function buildEvidenceMap(input: InsightInput): Record<string, string> {
  const {
    avoidanceZones = [], strengths = [], completionByDay = {}, avgConfidenceByOutcome = {},
    topOverrideReason, totalTasksCompleted = 0, totalTasksShown = 0, metacriticSignal,
  } = input;

  const map: Record<string, string> = {};

  avoidanceZones.forEach((zone, i) => { map[`avoidance:${i}`] = `Avoidance zone on record: "${zone}"`; });
  strengths.forEach((s, i) => { map[`strength:${i}`] = `Strength on record: "${s}"`; });

  for (const [day, stats] of Object.entries(completionByDay)) {
    if (stats && stats.total > 0) {
      map[`completion_day:${day}`] = `${day}: ${stats.completed} of ${stats.total} tasks completed in the last 30 days`;
    }
  }

  const executionRate = totalTasksShown > 0 ? Math.round((totalTasksCompleted / totalTasksShown) * 100) : null;
  if (executionRate != null) {
    map.execution_rate = `${executionRate}% overall execution rate (${totalTasksCompleted} of ${totalTasksShown} shown tasks completed) in the last 30 days`;
  }

  if (topOverrideReason) {
    map.override_reason = `Most common reason given for overriding a recommendation: "${topOverrideReason}"`;
  }

  if (metacriticSignal) {
    map.metacritic_signal = `Detected behavioral signal: "${metacriticSignal}"`;
  }

  for (const [outcome, value] of Object.entries(avgConfidenceByOutcome)) {
    if (typeof value === "number") {
      map[`confidence_outcome:${outcome}`] = `Average stated confidence on actions that ended in "${outcome}": ${Math.round(value * 100) / 100}`;
    }
  }

  return map;
}

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
        const input = body as InsightInput;
        const stage = input.stage ?? "Idea";

        const evidenceMap = buildEvidenceMap(input);
        const evidenceKeys = Object.keys(evidenceMap);

        // Fallback — generic but not stale/misleading. Not grounded in any
        // specific fact (there may be none yet), so basis/evidence are
        // null rather than pointing at something that isn't real.
        const fallback: InsightItem[] = [
          { type: "insight", text: "Keep completing daily tasks — your behavioral model will sharpen with each session.", basis: null, evidence: null },
          { type: "insight", text: "BuildMind tracks avoidance patterns, confidence trends, and execution rhythm over time.", basis: null, evidence: null },
        ];

        if (evidenceKeys.length === 0) {
          // Nothing real to cite yet — don't even call the model, there's
          // no way for it to produce a grounded insight from no data.
          for (let i = 0; i < fallback.length; i++) {
            controller.enqueue(encoder.encode(sse("insight", { index: i, ...fallback[i] })));
            await new Promise((r) => setTimeout(r, 120));
          }
          controller.enqueue(encoder.encode(sse("done", { ok: true, count: fallback.length })));
          controller.close();
          return;
        }

        const systemPrompt = `You are a startup execution analyst reviewing a founder's behavioral data from the last 30 days.
Your job is to surface 3-5 specific, named patterns — not generic advice.
Each insight must name WHAT is happening, WHY it matters for this stage, and WHAT to do about it.
Severity: "warning" for risks, "positive" for strong signals, "insight" for neutral observations.

You may ONLY base an insight on facts explicitly listed below under "Available facts" — do not invent numbers,
zones, or patterns that aren't listed. For each insight, set "basis" to the EXACT key (from the list) of the one
fact it's built on. If a fact doesn't support a real pattern, leave it out rather than stretching it into one —
returning fewer insights is fine, inventing a "basis" key that isn't in the list is not.

Return ONLY a valid JSON array:
[
  { "type": "warning"|"positive"|"insight", "text": "specific observation max 30 words", "basis": "<exact key from Available facts>" },
  ...
]
No preamble. No markdown. Only the JSON array.`;

        const userPrompt = [
          `Stage: ${stage}`,
          "Available facts (cite by key in \"basis\"):",
          ...evidenceKeys.map((key) => `  ${key}: ${evidenceMap[key]}`),
        ].join("\n");

        let insights: InsightItem[] = [];

        try {
          const ai = await groqJSON<Array<{ type?: string; text?: string; basis?: string }>>(systemPrompt, userPrompt);
          if (Array.isArray(ai)) {
            insights = ai
              .filter((item) => typeof item?.basis === "string" && Object.prototype.hasOwnProperty.call(evidenceMap, item.basis))
              .slice(0, 5)
              .map((item) => ({
                type: (["warning", "positive", "insight"].includes(item.type ?? "") ? item.type : "insight") as InsightItem["type"],
                text: String(item.text ?? "").slice(0, 200),
                basis: item.basis as string,
                // The server's own precomputed text for this key — never
                // the model's version of it — so a displayed "why" is
                // always literally true of the underlying data.
                evidence: evidenceMap[item.basis as string],
              }));
          }
        } catch {
          // insights stays [] — falls through to the generic fallback below
        }

        // Every candidate cited a key outside the real evidence map (or the
        // call failed outright) — fall back rather than show nothing, but
        // still marked as ungrounded so the UI doesn't claim otherwise.
        if (insights.length === 0) insights = fallback;

        for (let i = 0; i < insights.length; i++) {
          controller.enqueue(encoder.encode(sse("insight", { index: i, ...insights[i] })));
          await new Promise((r) => setTimeout(r, 120));
        }

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
