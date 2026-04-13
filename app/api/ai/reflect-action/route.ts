import { NextResponse } from "next/server";
import { groqJSON, hasAdminEnv } from "@/app/api/ai/_utils";
import { createAdminClient } from "@/lib/supabase/admin";

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

export async function POST(request: Request) {
  try {
    const body: ReflectActionInput = await request.json();
    const { outcome, note, confidence, stage, todayAction, streak, userId, projectId } = body;

    let projectContext = "";

    // If Supabase is wired, pull project context for deeper personalisation
    if (userId && projectId && hasAdminEnv()) {
      try {
        const supabase = createAdminClient();
        const { data: project } = await supabase
          .from("projects")
          .select("title, description, target_users, problem, startup_stage")
          .eq("id", projectId)
          .eq("user_id", userId)
          .single();

        if (project) {
          projectContext = `
Project: ${project.title}
Stage: ${project.startup_stage ?? stage}
Problem being solved: ${project.problem ?? "Not specified"}
Target users: ${project.target_users ?? "Not specified"}`;
        }

        // Write reflection to Supabase for future personalisation
        await supabase.from("reflections").insert({
          user_id: userId,
          project_id: projectId,
          outcome,
          note,
          confidence,
          today_action: todayAction,
          created_at: new Date().toISOString(),
        }); // non-blocking — table may not exist yet

        // ── Publish anonymised event to community Founder Feed ──────────────
        // We derive flag + location from the user's country metadata (set
        // during auth via Supabase's ip-based geo, or from the user profile).
        // Falls back to a generic placeholder so the feed always gets a row.
        try {
          const { data: authUser } = await supabase.auth.admin.getUserById(userId);
          const meta = (authUser?.user?.user_metadata ?? {}) as Record<string, string>;

          const flag     = meta.flag     ?? "🌍";
          const location = meta.city     ?? meta.location ?? meta.country ?? "Somewhere";

          // Map outcome → feed event type
          const typeMap: Record<string, string> = {
            completed: streak >= 7 ? "streak" : "done",
            partial:   "done",
            blocked:   "reflect",
            learned:   "reflect",
          };
          const eventType = typeMap[outcome] ?? "done";

          // Map stage → accent colour (mirrors explore/page.tsx seed data)
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

    const result = await groqJSON<ReflectActionOutput>(
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
    ).catch(() => fallback);

    return NextResponse.json({ success: true, data: { ...fallback, ...result } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Reflect action failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
