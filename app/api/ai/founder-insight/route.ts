/**
 * app/api/ai/founder-insight/route.ts
 *
 * Agentic pattern synthesis — reads ALL signal sources and writes
 * a structured behavioral profile back to founder_memory.
 *
 * Two modes:
 * POST with { prompt, memory } → conversational insight (original behavior, unchanged)
 * POST with { synthesize: true, userId } → full agentic synthesis (new)
 *
 * The synthesis mode closes the learning loop:
 * reflections + overrides + task completions → avoidance_zones + strengths + last_insight
 *
 * Called fire-and-forget from reflect-action/route.ts after every reflection.
 * Also triggered by the scheduled weekly_mirror job for full synthesis.
 *
 * Security: requires authenticated session. Synthesis mode additionally
 * verifies the requested userId matches the authenticated user (or is an
 * internal cron call with CRON_SECRET).
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/data/projects";
import { groqChat, groqJSON, hasAdminEnv, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { planFromUserMetadata } from "@/lib/plan";
import type { FounderMemory } from "@/lib/founderMemory";

// ── Internal cron check ───────────────────────────────────────────────────────
function isCronRequest(req: NextRequest): boolean {
  const authorization = req.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const secret = req.headers.get("x-cron-secret") ?? bearer;
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

// ── Conversational insight (original behavior — untouched) ───────────────────

async function handleConversationalInsight(prompt: string, memory: FounderMemory) {
  const systemPrompt = `You are a brutally honest startup co-founder who has been watching this founder build for months.
You have access to their behavioral patterns. You speak in direct, clear sentences.
Never be generic. Never hedge. Never say "it seems like" or "perhaps".
Your insight should feel like it came from someone who truly knows them.`;

  const insight = await groqChat(systemPrompt, [{ role: "user", content: prompt }]);
  return NextResponse.json({ insight });
}

// ── Agentic synthesis (new — writes back to founder_memory) ─────────────────

interface SynthesisOutput {
  avoidance_zones: string[];
  strengths: string[];
  personality_tags: string[];
  last_insight: string;
  cofounder_style: string;
  execution_pattern: string;
}

async function handleAgenticSynthesis(userId: string) {
  if (!hasAdminEnv()) {
    return NextResponse.json({ ok: false, error: "Admin env not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();

  const [reflectionsResult, overridesResult, contextResult, memoryResult] = await Promise.allSettled([
    supabase
      .from("reflections")
      .select("outcome, note, today_action, confidence, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("task_overrides")
      .select("reason, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("founder_context")
      .select("startup_summary, current_stage, avoidance_signals, topics_mentioned_repeatedly, cognitive_load, consecutive_tasks_completed")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("founder_memory")
      .select("avoidance_zones, strengths, personality_tags, insight_history")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const reflections = reflectionsResult.status === "fulfilled" ? reflectionsResult.value.data ?? [] : [];
  const overrides   = overridesResult.status   === "fulfilled" ? overridesResult.value.data   ?? [] : [];
  const context     = contextResult.status     === "fulfilled" ? contextResult.value.data          : null;
  const memory      = memoryResult.status      === "fulfilled" ? memoryResult.value.data           : null;

  if (reflections.length === 0 && overrides.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: "insufficient_data" });
  }

  const reflectionSummary = reflections
    .map((r, i) => `${i + 1}. Action: "${r.today_action ?? "none"}" | Outcome: ${r.outcome} | Confidence: ${r.confidence}/5 | Note: "${r.note ?? "none"}"`)
    .join("\n");

  const overrideSummary = overrides.length > 0
    ? `\nTask skips/overrides:\n${overrides.map((o: { reason?: string }) => `- ${o.reason ?? "no reason"}`).join("\n")}`
    : "";

  const contextSummary = context
    ? `\nFounder context: Stage=${context.current_stage}, Summary="${context.startup_summary}", CognitiveLoad=${context.cognitive_load}, ConsecutiveCompleted=${context.consecutive_tasks_completed}`
    : "";

  const previousProfile = memory
    ? `\nPrevious profile:\n- Avoidance: ${(memory.avoidance_zones ?? []).join(", ")}\n- Strengths: ${(memory.strengths ?? []).join(", ")}`
    : "";

  const synthesis = await groqJSON<SynthesisOutput>(
    `You are a behavioral analyst for a startup execution coaching app.
Analyze the founder's behavioral data and extract a structured profile.
Return JSON ONLY with these exact keys:
{
  "avoidance_zones": ["max 3 specific task types they consistently avoid, e.g. 'cold outreach', 'pricing discussions'"],
  "strengths": ["max 3 specific task types they complete fast/enthusiastically"],
  "personality_tags": ["max 4 tags like 'ships fast', 'overthinks design', 'avoids sales'"],
  "last_insight": "One sharp sentence (max 20 words) about their most important behavioral pattern right now",
  "cofounder_style": "one of: direct-challenger | strategic-partner | execution-coach | devil-advocate",
  "execution_pattern": "one of: consistent | sporadic | burst-idle | avoidance-loop"
}
Base these on actual patterns in the data. If no clear pattern exists, return empty arrays and null for insight.`,
    `Behavioral data:\n${reflectionSummary}${overrideSummary}${contextSummary}${previousProfile}`,
  );

  // Write synthesized profile back to founder_memory
  await supabase.from("founder_memory").upsert(
    {
      user_id:          userId,
      avoidance_zones:  synthesis.avoidance_zones  ?? memory?.avoidance_zones  ?? [],
      strengths:        synthesis.strengths         ?? memory?.strengths         ?? [],
      personality_tags: synthesis.personality_tags  ?? memory?.personality_tags  ?? [],
      last_insight:     synthesis.last_insight      ?? null,
      cofounder_style:  synthesis.cofounder_style   ?? "execution-coach",
      insight_history:  [
        ...(memory?.insight_history ?? []).slice(-9), // keep last 9
        ...(synthesis.last_insight ? [{ text: synthesis.last_insight, created_at: new Date().toISOString() }] : []),
      ],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return NextResponse.json({ ok: true, synthesis });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Synthesis mode — can be called by cron (with CRON_SECRET) or by the user themselves
  if (body?.synthesize === true) {
    const requestedUserId = String(body?.userId ?? "").trim();

    if (isCronRequest(req)) {
      // Cron-triggered synthesis — trust the userId in body
      if (!requestedUserId) {
        return NextResponse.json({ ok: false, error: "userId required for cron synthesis" }, { status: 400 });
      }
      return handleAgenticSynthesis(requestedUserId);
    }

    // User-triggered synthesis — must match authenticated user
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

    const targetUserId = requestedUserId || user.id;
    if (targetUserId !== user.id) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    return handleAgenticSynthesis(targetUserId);
  }

  // Conversational mode — requires auth + usage enforcement
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  try {
    await enforceAndTrackAIUsage(user.id, planFromUserMetadata(user));
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json({ ok: false, error: msg, upgradeUrl: "/upgrade" }, { status: 429 });
    }
  }

  const { prompt, memory } = body;
  if (!prompt) return NextResponse.json({ ok: false, error: "prompt required" }, { status: 400 });

  return handleConversationalInsight(String(prompt), memory as FounderMemory);
}
