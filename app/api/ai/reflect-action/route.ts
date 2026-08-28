import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv, enforceAndTrackAIUsage } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRouteUser } from "@/app/api/ai/_planCheck";
import { generateFounderInsight } from "@/lib/founderMemory";
import { FEATURES } from "@/lib/features";
import { callModelJSON } from "@/lib/ai-providers";
import { logError } from "@/lib/server/logger";
import { recordActivity } from "@/lib/server/activityLog";
import { evaluateAndCacheStageTransition } from "@/lib/server/stageTransition";
import { recordActionOutcome } from "@/lib/learning";
import { invalidateCognitionCache } from "@/lib/founderCognition";
import { classifyBlocker, runBlockerIntelligencePipeline } from "@/lib/blockerIntelligence";
import { momentumOnReflect } from "@/lib/momentum";
import { compareFounderIntelligenceOutcome, getFounderIntelligenceAccuracy } from "@/lib/learningLoop";
import { markRecommendationObserved } from "@/lib/recommendationLifecycle";

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
  // FIX: reflections had no way to know which task they resolved — every
  // task stayed "pending" forever regardless of reflection outcome. See
  // reflections_task_id.sql. Optional so this doesn't break reflections
  // that genuinely aren't tied to a specific roadmap task (e.g. an ad-hoc
  // daily action that isn't in the tasks table at all).
  taskId:        z.string().uuid().optional(),
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
  taskId?:       string;
}

interface ReflectActionOutput {
  witnessed: string;    // NEW: names specifically what you did today, unprompted by outcome —
                         // the "someone saw this" line. Distinct from causality (forward-looking)
                         // and identityLine (who you're becoming). This one just proves it registered.
  causality: string;   // "because you said X → tomorrow is Y"
  nextAction: string;  // personalised next concrete action
  identityLine: string; // who they're becoming ("You're someone who executes.")
  // Set only when this reflection actually resolved a pending Founder
  // Intelligence prediction — i.e. compareFounderIntelligenceOutcome found
  // something to score. Omitted (not zeroed) when there was nothing to
  // compare, so the UI can tell "no signal yet" apart from "confidence
  // didn't move."
  confidenceAdjustment?: {
    before: number; // rolling average_match_score before this reflection, 0-100
    after: number;  // rolling average_match_score after this reflection, 0-100
    trend: "up" | "down" | "flat" | "unknown";
  };
}

const FALLBACKS: Record<string, ReflectActionOutput> = {
  completed: {
    witnessed: "You said you'd do it, and you did — on a day nobody was checking but you.",
    causality: "Because you completed it → tomorrow goes deeper into what's working.",
    nextAction: "Double down on what worked today — apply the same energy to the next milestone.",
    identityLine: "You're someone who executes.",
  },
  partial: {
    witnessed: "You showed up and moved it forward, even without finishing — that's still real progress logged.",
    causality: "Because you partially completed it → tomorrow finishes before adding anything new.",
    nextAction: "Finish what you started. Incomplete work compounds into debt.",
    identityLine: "You're building the habit. Keep going.",
  },
  blocked: {
    witnessed: "You hit a wall today and told the system instead of pretending it didn't happen. That matters.",
    causality: "Because you got blocked → tomorrow removes the blocker before anything else.",
    nextAction: "Write down the exact blocker in one sentence. Then find one person who's solved it before.",
    identityLine: "Founders who name their blockers solve them. You named it.",
  },
  learned: {
    witnessed: "Today wasn't a shipped feature, but you're leaving it with something you didn't have this morning.",
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
    const { outcome, note, what_tried, what_happened, what_learned, blocker, confidence, stage, todayAction, streak, userId, projectId, taskId } = body;

    // Use the server-verified userId from auth, fall back to body for backwards compat
    const verifiedUserId = routeUser.userId ?? userId;

    let projectContext = "";
    // Hoisted so the AI prompt below (outside the Supabase try/catch) can
    // read the freshly-computed streak; stays undefined if Supabase isn't
    // wired or the block throws, in which case callers fall back to `streak`.
    let nextStreak: number | undefined;
    // Hoisted for the same reason as nextStreak — read by the response
    // payload below so the client can animate the actual server-computed
    // momentum change instead of guessing at one.
    let momentumBefore: number | undefined;
    let momentumAfter: number | undefined;
    // Hoisted for the same reason — set only when this reflection actually
    // resolved a pending Founder Intelligence prediction (see call site below).
    let confidenceAdjustment: ReflectActionOutput["confidenceAdjustment"];

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

        // Classify blocker into enum category before saving
        const blockerCategory = blocker ? classifyBlocker(blocker) : null;

        // Write reflection to Supabase for future personalisation
        await supabase.from("reflections").insert({
          user_id:      verifiedUserId,
          project_id:   projectId,
          task_id:      taskId ?? null,
          outcome,
          note,
          // Rich separated fields for aggressive personalisation
          what_tried:    what_tried    ?? null,
          what_happened: what_happened ?? null,
          what_learned:  what_learned  ?? null,
          blocker:          blocker       ?? null,
          blocker_category: blockerCategory,
          confidence,
          today_action:  todayAction,
          created_at:    new Date().toISOString(),
        });

        // FIX: reflect-action previously never touched the tasks table at
        // all — confirmed via real founder data showing has_reflection=true
        // with status still "pending" on every row. Only update when a real
        // taskId was supplied (never guess); ownership is enforced via
        // .eq("user_id", ...) so this can't touch another user's task even
        // if a taskId were somehow forged.
        if (taskId) {
          const taskStatus =
            outcome === "completed" ? "completed" :
            outcome === "blocked"   ? "blocked"   :
            null; // "partial"/"learned" — leave as-is, not a terminal state
          if (taskStatus) {
            await supabase
              .from("tasks")
              .update({ status: taskStatus, is_completed: taskStatus === "completed" })
              .eq("id", taskId)
              .eq("user_id", verifiedUserId)
              .then(() => {}, (err) => logError("reflect-action/task-status-update", err, { taskId, verifiedUserId }));
          }
        }

        // Blocker intelligence pipeline — fire-and-forget
        if (blockerCategory && blockerCategory !== "other") {
          void runBlockerIntelligencePipeline(supabase, verifiedUserId);
        }
        const todayDate = new Date().toISOString().slice(0, 10);
        // FIX: this was a THIRD independent, non-atomic (read-then-write,
        // no row lock) reimplementation of streak logic — separate from the
        // dedicated /api/founder-context/streak route and from
        // complete_task_atomic. The value written here was always
        // server-derived (never trusted the client's `streak` param for the
        // actual write), so this wasn't forgeable — but it was still a
        // fourth place computing "what is the new streak" with its own
        // copy of the same logic, exactly the pattern that caused months of
        // inconsistency elsewhere in this app. Now calls the same shared,
        // atomic RPC every other path uses.
        const { data: streakRpcData, error: streakErr } = await supabase.rpc("update_streak_atomic", {
          p_user_id: verifiedUserId,
          p_project_id: projectId ?? null,
          p_today: todayDate,
        });
        if (streakErr) {
          logError("reflect-action/streak", streakErr, { verifiedUserId });
        } else {
          nextStreak = streakRpcData ?? undefined;
        }

        // FIX: reflections previously never touched momentum_score at all —
        // momentumOnReflect() existed in lib/momentum.ts but had no caller.
        // Read the current value, apply the same EMA every other momentum
        // mutation uses, and write it back in the same update as last_active.
        try {
          const { data: fc } = await supabase
            .from("founder_context")
            .select("momentum_score, momentum_updated_at")
            .eq("user_id", verifiedUserId)
            .maybeSingle();

          const current = typeof fc?.momentum_score === "number" ? fc.momentum_score : 20;
          momentumBefore = current;
          const lastUpdated = fc?.momentum_updated_at ? new Date(fc.momentum_updated_at) : null;
          const daysSince = lastUpdated
            ? Math.max(1, Math.round((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)))
            : 1;
          momentumAfter = momentumOnReflect(current, daysSince);
        } catch (err) {
          logError("reflect-action/momentum-read", err, { verifiedUserId });
        }

        await supabase
          .from("founder_context")
          .update({
            last_active: todayDate,
            days_inactive: 0,
            ...(momentumAfter !== undefined
              ? { momentum_score: momentumAfter, momentum_updated_at: new Date().toISOString() }
              : {}),
          })
          .eq("user_id", verifiedUserId);

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
          // FIX: previously required outcome = 'pending' here. Confirmed via
          // trace that app/today/page.tsx's handleCheckIn already calls
          // /api/ai/reflexion-outcome immediately on check-in — BEFORE the
          // founder ever reaches this page — which sets this same row's
          // outcome away from 'pending' (e.g. to 'overridden') with
          // outcome_note left undefined. By the time this code ran, no row
          // with outcome='pending' existed anymore for today, so this query
          // silently found nothing and the blocker/note text typed here
          // never reached reflexion_learning_log.outcome_note — the real
          // reason "Why you skip" stayed empty even after the table the
          // frontend reads from was corrected. Match on "most recent row for
          // this user today" instead of a status Today's own check-in flow
          // already consumes. Updating the same outcome again here is
          // harmless (idempotent) — the real fix is that outcome_note now
          // actually gets attached.
          const { data: pendingLog } = await supabase
            .from("reflexion_learning_log")
            .select("id")
            .eq("user_id", verifiedUserId)
            .gte("created_at", todayDate)
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

        // Learning loop OBSERVE path via reflections (the primary way founders
        // report outcomes from today-action-stream). Non-fatal, fire-and-forget.
        // FIX: what_tried is the only REQUIRED field on the reflect form —
        // what_happened/what_learned are optional and, per production data,
        // are skipped on nearly every reflection. Excluding what_tried meant
        // evidence matching ran against near-empty text on most rows,
        // producing near-random low scores regardless of what actually
        // happened — which would have gone on to poison Thompson Sampling's
        // success/failure signal once candidate_id-tracked predictions
        // started resolving.
        const reflectionEvidenceText = [what_tried, what_happened, what_learned]
          .filter((v): v is string => Boolean(v?.trim()))
          .join(" — ")
          .trim();
        // Awaited (unlike the other fire-and-forget calls below) because the
        // Reflection Recorded screen shows a real before/after confidence
        // delta when this reflection resolved a pending prediction — that
        // requires reading accuracy on both sides of the comparison.
        try {
          const accuracyBefore = await getFounderIntelligenceAccuracy(supabase, verifiedUserId);
          const comparison = await compareFounderIntelligenceOutcome(supabase, {
            userId: verifiedUserId,
            taskTitle: todayAction ?? note ?? "",
            outcome,
            reflectionText: reflectionEvidenceText,
          });
          if (comparison) {
            // compareFounderIntelligenceOutcome already recomputed and cached
            // the rolling accuracy as part of resolving this prediction.
            const accuracyAfter = await getFounderIntelligenceAccuracy(supabase, verifiedUserId);
            confidenceAdjustment = {
              before: Math.round(accuracyBefore.average_match_score * 100),
              after: Math.round(accuracyAfter.average_match_score * 100),
              trend: accuracyAfter.trend,
            };
          }
        } catch {
          // Confidence delta is a bonus display, never block the reflection save.
        }
        markRecommendationObserved(supabase, {
          userId: verifiedUserId,
          taskTitle: todayAction ?? note ?? "",
          outcome,
          founderExplanation: note || blocker || undefined,
          evidenceProduced: reflectionEvidenceText || undefined,
        }).catch(() => {});
        recordActivity(verifiedUserId, "reflection_done", { projectId, outcome, confidence }).catch(() => {});
        // CONSOLIDATION: was checkAndCacheStageTransition() — see
        // lib/server/stageTransition.ts for why there's now one detector.
        evaluateAndCacheStageTransition(verifiedUserId, projectId).catch(() => {});

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
            completed: (nextStreak ?? streak) >= 7 ? "streak" : "done",
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
            streak: nextStreak ?? streak,
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
1. witnessed — one sentence that proves you actually registered what they specifically did today (reference their note/what_tried/what_happened/blocker if given, not the outcome label). This is not praise and not analysis — it's the "someone saw this" line. Solo founders build alone with no one to debrief with; this line is the one moment in the product where the system explicitly acknowledges the specific effort, not just logs it. Max 20 words. Never generic — if it could apply to any founder on any day, rewrite it.
2. causality — a specific "because you said X → tomorrow is Y" sentence (max 18 words, direct, no fluff)
3. nextAction — one concrete action for tomorrow, specific to your situation (max 25 words)
4. identityLine — a short identity-reinforcing statement about who you are becoming (max 12 words)

Rules:
- witnessed must reference something specific from the note/fields — never fall back to restating the outcome category
- causality must reference your actual note if provided
- nextAction must be specific — no generic advice
- identityLine should feel earned, not cheerleady
- CRITICAL: Write entirely in second person. Address the founder as "you"/"your". Never write "the founder", "they", or "their".
- If confidence is 1-2, acknowledge the difficulty but push forward
- If blocked, the next action is always: remove the blocker first
- Return JSON ONLY with keys: witnessed, causality, nextAction, identityLine`,
      `REFLECTION:
Outcome: ${outcome}
Note: "${note || "No note provided"}"
Confidence (1-5): ${confidence}
Today's action was: "${todayAction || "Not specified"}"
Startup stage: ${stage}
Current streak: ${nextStreak ?? streak} days
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

    return NextResponse.json({
      success: true,
      data: {
        ...fallback,
        ...result,
        streak: nextStreak ?? streak,
        momentum: momentumBefore !== undefined && momentumAfter !== undefined
          ? { before: momentumBefore, after: momentumAfter }
          : undefined,
        confidenceAdjustment,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reflect action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
