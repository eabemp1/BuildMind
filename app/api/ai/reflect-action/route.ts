import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { generateFounderInsight } from "@/lib/founderMemory";
import { FEATURES } from "@/lib/features";
import { callModelJSON } from "@/lib/ai-providers";

interface ReflectActionInput {
  outcome: "completed" | "blocked" | "partial" | "learned";
  note: string;
  confidence: number; // 1-5
  stage: string;
  todayAction: string;
  streak: number;
  userId?: string;
  projectId?: string;
}

interface ReflectActionOutput {
  causality: string;   // "because you said X → tomorrow is Y"
  nextAction: string;  // personalised next concrete action
  identityLine: string; // who they're becoming ("You're someone who executes.")
}

const FALLBACKS: Record<string, ReflectActionOutput> = {
  completed: {
    causality: "Because you completed it → tomorrow goes deeper into what's working.",
    nextAction: "Double down on what worked today — apply the same energy to the next milestone.",
    identityLine: "You're someone who executes.",
  },
  partial: {
    causality: "Because you partially completed it → tomorrow finishes before adding anything new.",
    nextAction: "Finish what you started. Incomplete work compounds into debt.",
    identityLine: "You're building the habit. Keep going.",
  },
  blocked: {
    causality: "Because you got blocked → tomorrow removes the blocker before anything else.",
    nextAction: "Write down the exact blocker in one sentence. Then find one person who's solved it before.",
    identityLine: "Founders who name their blockers solve them. You named it.",
  },
  learned: {
    causality: "Because you learned something → tomorrow applies that insight to a real user.",
    nextAction: "Take what you learned and test it with one real person today. Knowledge without action is trivia.",
    identityLine: "You're learning faster than most founders even start.",
  },
};

/**
 * extractAndWritePatterns — closes the learning loop.
 *
 * Reads the last 5 reflections and writes back avoidance_signals +
 * topics_mentioned_repeatedly to founder_context. This is what populates
 * the fields that every prompt reads — without this, the context feed is empty.
 *
 * Called fire-and-forget after each reflection save so it never blocks the response.
 * Multi-source: uses outcomes, notes, override reasons, and repeated tasks.
 */
async function extractAndWritePatterns(
  supabase: ReturnType<typeof import("@/lib/supabase/admin").createAdminClient>,
  userId: string
): Promise<void> {
  // Pull last 5 reflections
  const { data: recentReflections } = await supabase
    .from("reflections")
    .select("outcome, note, today_action, confidence, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!recentReflections || recentReflections.length < 2) return; // Not enough signal yet

  // Pull override reasons if the table exists
  let overridesData: { reason?: string }[] = [];
  try {
    const { data } = await supabase
      .from("task_overrides")
      .select("reason")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);
    overridesData = data ?? [];
  } catch {
    overridesData = [];
  }
  const overrides = overridesData;

  const reflectionSummary = recentReflections.map((r, i) =>
    `${i + 1}. Action: "${r.today_action ?? "none"}" | Outcome: ${r.outcome} | Confidence: ${r.confidence}/5 | Note: "${r.note ?? "none"}"`
  ).join("\n");

  const overrideSummary = (overrides ?? []).length > 0
    ? `\nTask overrides/skips:\n${(overrides ?? []).map((o: { reason?: string }) => `- ${o.reason ?? "no reason given"}`).join("\n")}`
    : "";

  const patterns = await callModelJSON<{
    avoidance_signals?: string[];
    topics_mentioned_repeatedly?: string[];
  }>([
    {
      role: "system",
      content: `You are a behavioral pattern extractor for a startup execution app.
Analyze this founder's recent reflections and identify:
1. avoidance_signals: Tasks or activities they keep blocking on, skipping, or reporting as "blocked" (max 3 items, specific action types e.g. "cold outreach", "pricing conversations")
2. topics_mentioned_repeatedly: Themes or topics that appear in multiple notes (max 3 items, e.g. "payment integration", "user interviews", "co-founder search")

Return JSON ONLY: { "avoidance_signals": [], "topics_mentioned_repeatedly": [] }
If there are no clear patterns yet, return empty arrays. Do not guess.`,
    },
    {
      role: "user",
      content: `Recent reflections:\n${reflectionSummary}${overrideSummary}`,
    },
  ], { role: "reasoning", temperature: 0.2, maxTokens: 200 });

  if (!patterns.avoidance_signals && !patterns.topics_mentioned_repeatedly) return;

  // Write patterns back to founder_context
  await supabase
    .from("founder_context")
    .upsert(
      {
        user_id: userId,
        ...(patterns.avoidance_signals?.length ? { avoidance_signals: patterns.avoidance_signals } : {}),
        ...(patterns.topics_mentioned_repeatedly?.length ? { topics_mentioned_repeatedly: patterns.topics_mentioned_repeatedly } : {}),
      },
      { onConflict: "user_id" }
    );
}

export async function POST(request: Request) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const routeUser = await getRouteUser();
  if (!routeUser) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // ── Usage enforcement ──────────────────────────────────────────────────────
  try {
    await enforceAndTrackAIUsage(routeUser.userId);
  } catch (usageErr) {
    const msg = usageErr instanceof Error ? usageErr.message : String(usageErr);
    if (msg.toLowerCase().includes("limit reached")) {
      return NextResponse.json(
        { success: false, error: msg, upgradeUrl: "/upgrade" },
        { status: 429 },
      );
    }
  }

  try {
    const body: ReflectActionInput = await request.json();
    const { outcome, note, confidence, stage, todayAction, streak, userId, projectId } = body;

    // Use the server-verified userId from auth, fall back to body for backwards compat
    const verifiedUserId = routeUser.userId ?? userId;

    let projectContext = "";

    // If Supabase is wired, pull project context for deeper personalisation
    if (verifiedUserId && projectId && hasAdminEnv()) {
      try {
        const supabase = createAdminClient();
        const { data: project } = await supabase
          .from("projects")
          .select("name, title, description, target_users, problem, startup_stage")
          .eq("id", projectId)
          .eq("user_id", verifiedUserId)
          .single();

        if (project) {
          projectContext = `
Project: ${project.name ?? project.title}
Stage: ${project.startup_stage ?? stage}
Problem being solved: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}`;
        }

        // Write reflection to Supabase for future personalisation
        await supabase.from("reflections").insert({
          user_id: verifiedUserId,
          project_id: projectId,
          outcome,
          note,
          confidence,
          today_action: todayAction,
          created_at: new Date().toISOString(),
        });

        // ── Fire-and-forget: close both learning loops ────────────────────────
        extractAndWritePatterns(supabase, verifiedUserId).catch(() => {});

        // Trigger full synthesis after every reflection (fire-and-forget)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ai/founder-insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ synthesize: true, userId: verifiedUserId }),
        }).catch(() => {});

        // ── Publish anonymised event to community Founder Feed ──────────────
        try {
          if (!FEATURES.publicProjects) throw new Error("Founder feed disabled");
          const { data: authUser } = await supabase.auth.admin.getUserById(verifiedUserId);
          const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, string>;

          const flag     = meta.flag     ?? "🌍";
          const location = meta.city     ?? meta.location ?? meta.country ?? "Somewhere";

          const typeMap: Record<string, string> = {
            completed: streak >= 7 ? "streak" : "done",
            partial:   "done",
            blocked:   "reflect",
            learned:   "reflect",
          };
          const eventType = typeMap[outcome] ?? "done";

          const stageColorMap: Record<string, string> = {
            Idea:       "#f59e0b",
            Validation: "#10b981",
            MVP:        "#6366f1",
            Launch:     "#ef4444",
            Growth:     "#a78bfa",
            Revenue:    "#a78bfa",
          };
          const stageColor = stageColorMap[stage] ?? "#6366f1";

          await supabase.from("feed_events").insert({
            flag,
            location,
            stage,
            stage_color: stageColor,
            action:      todayAction,
            outcome:     note && note.trim() ? note.trim() : null,
            streak,
            type:        eventType,
          });
        } catch {
          // Feed publish failed — never block the reflect response
        }
      } catch {
        // DB unavailable — continue with local data
      }
    }

    const fallback = FALLBACKS[outcome] ?? FALLBACKS.completed;

    // Fix: wrap in try/catch — groqJSON PromiseLike does not expose .catch()
    let result: ReflectActionOutput;
    try {
      result = await groqJSON<ReflectActionOutput>(
      `You are BuildMind, a ruthlessly honest execution coach for solo founders.
Your job: take a founder's daily reflection and generate:
1. causality — a specific "because you said X → tomorrow is Y" sentence (max 18 words, direct, no fluff)
2. nextAction — one concrete action for tomorrow, specific to their situation (max 25 words)
3. identityLine — a short identity-reinforcing statement about who they're becoming (max 12 words)

Rules:
- causality must reference their actual note if provided
- nextAction must be specific — no generic advice
- identityLine should feel earned, not cheerleady
- If confidence is 1-2, acknowledge the difficulty but push forward
- If blocked, the next action is always: remove the blocker first
- Return JSON ONLY with keys: causality, nextAction, identityLine`,
      `REFLECTION:
Outcome: ${outcome}
Note: "${note || "No note provided"}"
Confidence (1-5): ${confidence}
Today's action was: "${todayAction || "Not specified"}"
Startup stage: ${stage}
Current streak: ${streak} days
${projectContext}`,
      );
    } catch {
      result = fallback;
    }

    void (async () => {
      try {
        await generateFounderInsight();
      } catch {
        // Non-fatal
      }
    })();

    return NextResponse.json({ success: true, data: { ...fallback, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reflect action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
