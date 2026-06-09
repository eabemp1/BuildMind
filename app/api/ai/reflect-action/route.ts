import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { generateFounderInsight } from "@/lib/founderMemory";
import { FEATURES } from "@/lib/features";
import { callModelJSON } from "@/lib/ai-providers";
import { logError } from "@/lib/server/logger";
import { recordActivity } from "@/lib/server/activityLog";
import { checkAndCacheStageTransition } from "@/lib/server/stageTransitionCache";
import { recordActionOutcome } from "@/lib/learning";
import { invalidateCognitionCache } from "@/lib/founderCognition";

import { z } from "zod";

// Runtime schema — mirrors the TypeScript interface but enforces types at the
// network boundary. Prevents type confusion attacks on fields passed to AI prompts.
const ReflectActionSchema = z.object({
  outcome:       z.enum(["completed", "blocked", "partial", "learned"]),
  note:          z.string().max(2000).default(""),
  // Rich separated fields — the real learning signal
  what_tried:    z.string().max(500).optional(),
  what_happened: z.string().max(500).optional(),
  what_learned:  z.string().max(500).optional(),
  blocker:       z.string().max(300).optional(),
  confidence:    z.number().int().min(1).max(5),
  stage:         z.string().max(100).default("idea"),
  todayAction:   z.string().max(2000).default(""),
  streak:        z.number().int().min(0).max(9999).default(0),
  userId:        z.string().uuid().optional(),
  projectId:     z.string().uuid().optional(),
});

interface ReflectActionInput {
  outcome:       "completed" | "blocked" | "partial" | "learned";
  note:          string;
  what_tried?:   string;
  what_happened?: string;
  what_learned?: string;
  blocker?:      string;
  confidence:    number; // 1-5
  stage:         string;
  todayAction:   string;
  streak:        number;
  userId?:       string;
  projectId?:    string;
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
 * Reads the last 5 reflections and writes back avoidance_zones +
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
    .select("outcome, note, today_action, confidence, created_at, what_tried, what_happened, what_learned, blocker")
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

  const reflectionSummary = recentReflections.map((r, i) => {
    return [
      `${i + 1}. Action: "${r.today_action ?? r.note ?? "none"}"`,
      `   Outcome: ${r.outcome} | Confidence: ${r.confidence}/5`,
      r.what_tried ? `   What they tried: "${r.what_tried}"` : "",
      r.what_happened ? `   What happened: "${r.what_happened}"` : "",
      r.what_learned ? `   What they learned: "${r.what_learned}"` : "",
      r.blocker ? `   Blocker: "${r.blocker}"` : "",
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const overrideSummary = (overrides ?? []).length > 0
    ? `\nTask overrides/skips:\n${(overrides ?? []).map((o: { reason?: string }) => `- ${o.reason ?? "no reason given"}`).join("\n")}`
    : "";

  const patterns = await callModelJSON<{
    avoidance_zones?: string[];
    topics_mentioned_repeatedly?: string[];
  }>([
    {
      role: "system",
      content: `You are a behavioral pattern extractor for a startup execution app.
Analyze this founder's recent reflections and identify:
1. avoidance_zones: Tasks or activities they keep blocking on, skipping, or reporting as "blocked" (max 3 items, specific action types e.g. "cold outreach", "pricing conversations")
2. topics_mentioned_repeatedly: Themes or topics that appear in multiple notes (max 3 items, e.g. "payment integration", "user interviews", "co-founder search")

Return JSON ONLY: { "avoidance_zones": [], "topics_mentioned_repeatedly": [] }
If there are no clear patterns yet, return empty arrays. Do not guess.`,
    },
    {
      role: "user",
      content: `Recent reflections:\n${reflectionSummary}${overrideSummary}`,
    },
  ], { role: "reasoning", temperature: 0.2, maxTokens: 200 });

  if (!patterns.avoidance_zones && !patterns.topics_mentioned_repeatedly) return;

  // Write patterns back to founder_context
  await supabase
    .from("founder_context")
    .upsert(
      {
        user_id: userId,
        ...(patterns.avoidance_zones?.length ? { avoidance_zones: patterns.avoidance_zones } : {}),
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
    const rawBody = await request.json().catch(() => ({}));
    const parseResult = ReflectActionSchema.safeParse(rawBody);
    if (!parseResult.success) {
      return NextResponse.json(
        { ok: false, error: "Invalid request body", issues: parseResult.error.issues },
        { status: 400 }
      );
    }
    const body: ReflectActionInput = parseResult.data;
    const { outcome, note, what_tried, what_happened, what_learned, blocker, confidence, stage, todayAction, streak, userId, projectId } = body;

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
          .maybeSingle();

        if (project) {
          projectContext = `
Project: ${project.name ?? project.title}
Stage: ${project.startup_stage ?? stage}
Problem being solved: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}`;
        }

        // Write reflection to Supabase for future personalisation
        await supabase.from("reflections").insert({
          user_id:      verifiedUserId,
          project_id:   projectId,
          outcome,
          note,
          // Rich separated fields for aggressive personalisation
          what_tried:    what_tried    ?? null,
          what_happened: what_happened ?? null,
          what_learned:  what_learned  ?? null,
          blocker:       blocker       ?? null,
          confidence,
          today_action:  todayAction,
          created_at:    new Date().toISOString(),
        });

        const todayDate = new Date().toISOString().slice(0, 10);
        const { data: existingContext } = await supabase
          .from("founder_context")
          .select("streak, last_checkin_date")
          .eq("user_id", verifiedUserId)
          .maybeSingle();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayDate = yesterday.toISOString().slice(0, 10);
        const lastCheckinDate = existingContext?.last_checkin_date ?? null;
        const previousStreak = existingContext?.streak ?? 0;
        const nextStreak = lastCheckinDate === todayDate
          ? previousStreak
          : lastCheckinDate === yesterdayDate
            ? previousStreak + 1
            : 1;

        await supabase
          .from("founder_context")
          .upsert({
            user_id: verifiedUserId,
            streak: nextStreak,
            last_checkin_date: todayDate,
            last_active: todayDate,
            days_inactive: 0,
          }, { onConflict: "user_id" });

        await supabase
          .from("user_behavior_state")
          .upsert([
            {
              user_id: verifiedUserId,
              key: "today_action",
              value: { action: todayAction, outcome, note, confidence },
              updated_at: new Date().toISOString(),
            },
            {
              user_id: verifiedUserId,
              key: "checkin_done_date",
              value: todayDate,
              updated_at: new Date().toISOString(),
            },
            {
              user_id: verifiedUserId,
              key: "reflect_done_date",
              value: todayDate,
              updated_at: new Date().toISOString(),
            },
          ], { onConflict: "user_id,key" });

        try {
          const { data: pendingLog } = await supabase
            .from("reflexion_learning_log")
            .select("id")
            .eq("user_id", verifiedUserId)
            .eq("outcome", "pending")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pendingLog?.id) {
            const mappedOutcome =
              outcome === "completed" ? "completed" :
              outcome === "blocked" ? "overridden" :
              "partial";
            await recordActionOutcome({
              logRowId: pendingLog.id,
              userId: verifiedUserId,
              outcome: mappedOutcome,
              outcomeNote: note || blocker || undefined,
            });
          }
        } catch {
          // Learning-log closure is best-effort; reflection is already saved.
        }

        // Bust the today_action_cache so the next page load regenerates with fresh reflection data.
        try {
          await supabase
            .from("user_behavior_state")
            .update({ value: null, updated_at: new Date().toISOString() })
            .eq("user_id", verifiedUserId)
            .eq("key", "today_action_cache");
        } catch {
          // Cache bust is best-effort; reflection save should still succeed.
        }

        // ── Fire-and-forget: close both learning loops ────────────────────────
        try { invalidateCognitionCache(verifiedUserId); } catch { /* non-fatal */ }
        extractAndWritePatterns(supabase, verifiedUserId).catch((err) => logError("reflect-action/extractPatterns", err));
        recordActivity(verifiedUserId, "reflection_done", { projectId, outcome, confidence }).catch(() => {});
        checkAndCacheStageTransition(verifiedUserId, projectId).catch(() => {});

        // Trigger full synthesis after every reflection (fire-and-forget)
        fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/ai/founder-insight`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ synthesize: true, userId: verifiedUserId }),
        }).catch((err) => logError("reflect-action/founderInsight", err));

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
Your job: take the founder's daily reflection and generate:
1. causality — a specific "because you said X → tomorrow is Y" sentence (max 18 words, direct, no fluff)
2. nextAction — one concrete action for tomorrow, specific to your situation (max 25 words)
3. identityLine — a short identity-reinforcing statement about who you are becoming (max 12 words)

Rules:
- causality must reference your actual note if provided
- nextAction must be specific — no generic advice
- identityLine should feel earned, not cheerleady
- CRITICAL: Write entirely in second person. Address the founder as "you"/"your". Never write "the founder", "they", or "their".
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
