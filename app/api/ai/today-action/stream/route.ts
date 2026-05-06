/**
 * app/api/ai/today-action/stream/route.ts
 *
 * Server-Sent Events endpoint that streams the 3-agent Reflexion Loop
 * progressively so the Today page shows live progress instead of a
 * 3–6 second blank wait.
 *
 * Event stream format (ndjson lines):
 *   event: agent_a   — Agent A (Generator) output ready
 *   event: agent_b   — Agent B (Critic) verdict ready
 *   event: agent_c   — Agent C (Refiner) output ready
 *   event: done      — Full result payload (same shape as /today-action JSON)
 *   event: error     — Fatal error — client falls back to static action
 *
 * The client upgrades to this endpoint and degrades gracefully to the
 * existing /api/ai/today-action JSON route if SSE is unavailable.
 */

import { NextResponse } from "next/server";
import { enforceAndTrackAIUsage, hasAdminEnv, logReflexionQuality } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWeeklyCriticPersona, groqCall } from "@/lib/reflexion";
import { getRouteUser } from "@/app/api/ai/_planCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

type TodayAction = {
  action: string;
  platform: string;
  target_user: string;
  message: string;
  why: string;
  time: string;
};

function buildFallback(stage: string, targetUsers: string, problem: string, title: string): TodayAction {
  const userType = targetUsers?.trim() || "potential users";
  const problemDesc = problem?.trim() || "this problem";
  const productName = title?.trim() || "your product";
  const fallbacks: Record<string, TodayAction> = {
    Idea: {
      action: `Message 3 ${userType} today — no pitch, just ask about ${problemDesc}.`,
      platform: "WhatsApp or LinkedIn",
      target_user: userType,
      message: `Hi [Name], quick question — what's your biggest frustration with ${problemDesc}? I'm researching it and would love 10 minutes.`,
      why: `Every assumption you have about ${userType} is probably wrong. Three real conversations will invalidate more than a week of planning.`,
      time: "1 hour",
    },
    Validation: {
      action: `Send 5 personal DMs to ${userType} — ask about their workflow, not your idea.`,
      platform: "LinkedIn or WhatsApp",
      target_user: userType,
      message: `Hi [Name], how do ${userType} handle ${problemDesc}? Not pitching — genuinely curious.`,
      why: `The Mom Test: ask about their life, not your idea. You'll get honest answers.`,
      time: "1–2 hours",
    },
    MVP: {
      action: `Share ${productName} with 2 ${userType} and watch them use it — don't explain.`,
      platform: "Screen share or in person",
      target_user: userType,
      message: `Hi [Name], I've built something rough to solve ${problemDesc}. Try it for 10 minutes while I watch?`,
      why: `Their confusion is your roadmap. Ship it.`,
      time: "45 minutes",
    },
    Launch: {
      action: `Post ${productName} in one community where ${userType} gather — one honest sentence about ${problemDesc}.`,
      platform: "Twitter/X, LinkedIn, or relevant Slack",
      target_user: userType,
      message: `Built ${productName} to fix ${problemDesc} for ${userType}. It's live. Try it: [link]`,
      why: `Visibility beats perfection.`,
      time: "30 minutes",
    },
    Growth: {
      action: `Call one ${userType} who stopped using ${productName} — ask why, don't defend.`,
      platform: "Phone call",
      target_user: userType,
      message: `Hi [Name], I noticed you stopped using ${productName}. No pitch — just want to understand. 10 minutes?`,
      why: `One churned user teaches you more than 10 new signups.`,
      time: "45 minutes",
    },
    Revenue: {
      action: `Send a direct pricing message to 3 active ${userType} — ask if they'd pay.`,
      platform: "WhatsApp or Email",
      target_user: userType,
      message: `Hi [Name], considering charging for ${productName}. Would [price] feel fair? Be honest.`,
      why: `Willingness-to-pay is the only signal that matters at revenue stage.`,
      time: "30 minutes",
    },
  };
  return fallbacks[stage] ?? fallbacks["Idea"];
}

export async function POST(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function emit(event: string, data: unknown) {
        controller.enqueue(encoder.encode(sse(event, data)));
      }

      try {
        // ── Auth ──────────────────────────────────────────────────────────
        const routeUser = await getRouteUser();
        if (!routeUser) {
          emit("error", { message: "Unauthorized" });
          controller.close();
          return;
        }

        const body = await request.json().catch(() => ({}));
        const userId = String(body?.userId ?? routeUser.userId).trim();
        const projectId = String(body?.projectId ?? "").trim();
        const providedStage = String(body?.stage ?? "").trim().slice(0, 50);

        if (userId !== routeUser.userId || !userId || !projectId) {
          emit("error", { message: "Invalid request" });
          controller.close();
          return;
        }

        await enforceAndTrackAIUsage(userId, routeUser.plan);

        // ── Project context ───────────────────────────────────────────────
        let stage = providedStage || "Idea";
        let targetUsers = "";
        let problem = "";
        let title = "";
        let projectContext = "";
        let lastReflectionContext = "";

        if (hasAdminEnv()) {
          const supabase = createAdminClient();
          const [projectResult, memoryResult] = await Promise.allSettled([
            supabase.from("projects")
              .select("title, description, target_users, problem, startup_stage")
              .eq("id", projectId).eq("user_id", userId).single(),
            supabase.from("founder_memory")
              .select("avoidance_zones, strengths, last_insight")
              .eq("user_id", userId).maybeSingle(),
          ]);

          const project = projectResult.status === "fulfilled" ? projectResult.value.data : null;
          const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;

          if (project) {
            stage = (project.startup_stage ?? providedStage) || "Idea";
            targetUsers = project.target_users ?? "";
            problem = project.problem ?? "";
            title = project.title ?? "";

            const { data: milestones } = await supabase.from("milestones")
              .select("id, title, status").eq("project_id", projectId)
              .order("created_at", { ascending: true });

            const pending = (milestones ?? []).filter(m => m.status !== "completed").map(m => m.title).slice(0, 5);
            const done = (milestones ?? []).filter(m => m.status === "completed").length;

            projectContext = `Project: ${title}\nStage: ${stage}\nProblem: ${problem || "Not specified"}\nTarget users: ${targetUsers || "Not specified"}\nPending milestones: ${pending.join(", ") || "None"}\nCompleted milestones: ${done}`;
          }

          if (memory) {
            const avoidance = (memory.avoidance_zones ?? []) as string[];
            if (avoidance.length) {
              lastReflectionContext += `\nAvoidance zones: ${avoidance.join(", ")} — name the pattern and assign it anyway.`;
            }
          }

          const { data: lastReflection } = await supabase.from("reflections")
            .select("outcome, note, confidence, today_action, created_at")
            .eq("user_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle();

          if (lastReflection) {
            const reflectDate = new Date(lastReflection.created_at).toLocaleDateString();
            lastReflectionContext = `\nLAST REFLECTION (${reflectDate}):\nYesterday: "${lastReflection.today_action ?? "Not recorded"}"\nOutcome: ${lastReflection.outcome}\nConfidence: ${lastReflection.confidence}/5\nNote: "${lastReflection.note ?? "None"}"` + lastReflectionContext;
          }
        }

        const fallback = buildFallback(stage, targetUsers, problem, title);
        const GROQ_API_KEY = process.env.GROQ_API_KEY;
        const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

        if (!GROQ_API_KEY) {
          emit("done", { success: true, data: { ...fallback, stage, reflexion: null } });
          controller.close();
          return;
        }

        // ── Agent A — Generator ───────────────────────────────────────────
        emit("agent_a", { status: "running", label: "Agent A generating your task…" });

        const systemA = `You are BuildMind, a brutally honest execution coach for solo founders.
Return a single concrete task for today. Must include: specific number of people, exact platform, exact user type.
Bad: "message some users". Good: "Message 3 fintech founders on LinkedIn today — ask about their workflow, not your idea."
${projectContext ? `\nFOUNDER DATA:\n${projectContext}` : ""}
${lastReflectionContext}`;

        let agentAOutput = "";
        try {
          agentAOutput = await groqCall(
            [{ role: "system", content: systemA }, { role: "user", content: "Give me today's single most important task." }],
            0.6, 300
          );
        } catch {
          agentAOutput = `${fallback.action} — ${fallback.why}`;
        }

        emit("agent_a", { status: "done", output: agentAOutput });

        // ── Agent B — Critic ──────────────────────────────────────────────
        const criticPersona = getWeeklyCriticPersona();
        emit("agent_b", { status: "running", label: `Agent B (${criticPersona.name}) critiquing…` });

        let criticVerdict: "pass" | "fail" = "pass";
        let criticReason = "Looks good.";
        let improvedVersion: string | null = null;

        try {
          const criticBody = JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.3,
            max_tokens: 300,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content: `${criticPersona.prompt}\nReject if ANY: no specific platform, no number, no named user type, too vague, applies to any founder.\nJSON: { "verdict": "pass"|"fail", "reason": "one sentence", "improved_version": "better task if fail else null" }\nContext: Stage=${stage}, Target users=${targetUsers || "unknown"}`,
              },
              { role: "user", content: `Evaluate: "${agentAOutput}"` },
            ],
          });

          const criticRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
            body: criticBody,
          });

          if (criticRes.ok) {
            const body = await criticRes.json();
            const parsed = JSON.parse(body?.choices?.[0]?.message?.content ?? "{}");
            criticVerdict = (parsed.verdict === "fail" ? "fail" : "pass") as "pass" | "fail";
            criticReason = parsed.reason ?? "OK";
            improvedVersion = parsed.improved_version ?? null;
          }
        } catch {
          // critic failed — default to pass
        }

        emit("agent_b", {
          status: "done",
          verdict: criticVerdict,
          reason: criticReason,
          persona: criticPersona.name,
        });

        // ── Agent C — Refiner ─────────────────────────────────────────────
        emit("agent_c", { status: "running", label: "Agent C refining final version…" });

        const baseForC = criticVerdict === "fail" && improvedVersion ? improvedVersion : agentAOutput;
        const refineMode = criticVerdict === "fail"
          ? "REBUILD: The original was rejected. Make it sharper and more specific."
          : "POLISH: Tighten wording only — do not change substance.";

        let refined = baseForC;
        let rationale = `Because you're at ${stage} stage and this is the highest-leverage move today.`;

        try {
          refined = await groqCall(
            [{
              role: "system",
              content: `BuildMind execution engine. ${refineMode}\nRules: exact platform, exact user type, a number, completable in 30 min, 2–3 sentences max.\nInput: ${baseForC}\nCritique: ${criticReason}\nStage: ${stage} | Target: ${targetUsers || "not set"}`,
            }, { role: "user", content: "Write the refined task." }],
            0.3, 250
          );

          rationale = await groqCall(
            [{
              role: "system",
              content: `One sentence (max 15 words) explaining WHY this is right for this founder NOW. Start with "Because".`,
            }, { role: "user", content: refined }],
            0.2, 60
          ).catch(() => rationale);
        } catch {
          // refiner failed — use Agent A output
        }

        emit("agent_c", { status: "done", output: refined });

        // ── Merge into TodayAction shape ──────────────────────────────────
        const finalData = {
          ...fallback,
          action: refined || fallback.action,
          why: rationale,
          stage,
          isAI: true,
          reflexion: {
            verdict: criticVerdict,
            criticPersona: criticPersona.name,
            rationale,
            loopRan: true,
            passedCritic: criticVerdict !== "fail",
            lastReflectionUsed: lastReflectionContext.includes("LAST REFLECTION"),
          },
        };

        // Quality log (fire-and-forget)
        if (hasAdminEnv() && finalData.action) {
          logReflexionQuality({
            userId, projectId,
            context: "today_action_stream",
            finalOutput: finalData.action,
            stage, targetUsers,
          }).catch(() => {});
        }

        emit("done", { success: true, data: finalData });
        controller.close();

      } catch (err) {
        const msg = err instanceof Error ? err.message : "Stream failed";
        try {
          controller.enqueue(encoder.encode(sse("error", { message: msg })));
        } catch {}
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// GET not supported — SSE requires POST (body carries auth context)
export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
