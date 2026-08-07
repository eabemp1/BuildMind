/**
 * app/api/founder-context/task-complete/route.ts
 * POST → records task completion, boosts momentum, updates last_active,
 *        and runs pattern detection (Playbook §3.2) to surface behavioural signals.
 *
 * PATCHES APPLIED (June 2026):
 *  1. checkin_done_date upsert is now AWAITED (was fire-and-forget) so cross-device
 *     done-state is visible before the client navigates away.
 *  2. reflexion_learning_log insert added so Reports page task counts are always correct,
 *     regardless of whether log_row_id was set by the stream route.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dailyActivitySignal } from "@/lib/momentum";
import { detectPattern, shouldSurfacePattern, type PatternResult } from "@/lib/patternDetection";
import { recordActivity } from "@/lib/server/activityLog";
import { checkAndCacheStageTransition } from "@/lib/server/stageTransitionCache";
import { invalidateCognitionCache } from "@/lib/founderCognition";
import { compareFounderIntelligenceOutcome } from "@/lib/learningLoop";

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ ok: false }, { status: 401 });

  const { stage = "", projectId = "", taskTitle = "", outcome = "completed" } = await req.json().catch(() => ({}));
  const admin = createAdminClient();

  // Fetch context + founder_memory + recent task titles in parallel for pattern detection
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const [ctxResult, memoryResult, recentTasksResult] = await Promise.allSettled([
    admin
      .from("founder_context")
      .select("momentum_score, tasks_accepted_this_week, tasks_overridden_this_week, current_stage, consecutive_tasks_completed, last_active, tasks_completed_today, last_task_date, tasks_completed_total, override_reasons, topics_mentioned_repeatedly, days_inactive, last_pattern_shown_at, momentum_last_week, streak, last_checkin_date, xp")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("founder_memory")
      .select("avoidance_zones")
      .eq("user_id", user.id)
      .maybeSingle(),
    admin
      .from("reflections")
      .select("today_action")
      .eq("user_id", user.id)
      .gte("created_at", fourteenDaysAgo)
      .not("today_action", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const ctx = ctxResult.status === "fulfilled" ? ctxResult.value.data : null;
  const memory = memoryResult.status === "fulfilled" ? memoryResult.value.data : null;
  const recentTaskTitles = recentTasksResult.status === "fulfilled"
    ? (recentTasksResult.value.data ?? []).map((r: { today_action: string }) => r.today_action).filter(Boolean)
    : [];

  const previousTaskCount = ctx?.tasks_accepted_this_week ?? 0;
  const isFirstTask = previousTaskCount === 0;

  // Hard tasks (launch/revenue stage) give bigger momentum boost
  const isHardTask = ["launch", "revenue", "growth"].some(s =>
    (stage || ctx?.current_stage || "").toLowerCase().includes(s)
  );

  // EMA needs to know how many days elapsed since momentum was last touched —
  // a task completed after a 5-day gap should compound differently than one
  // completed the day after the last update.
  const today = new Date().toISOString().slice(0, 10); // UTC — matches fetchBehaviorState comparison
  const lastActiveForGap = ctx?.last_active ?? today;
  const daysSinceLastUpdate = Math.max(
    1,
    Math.round((new Date(today).getTime() - new Date(lastActiveForGap).getTime()) / 86_400_000),
  );
  const todayCountBeforeThis = ctx?.last_task_date === today ? (ctx?.tasks_completed_today ?? 0) : 0;

  // FIX (root cause of the months-long inconsistency): this route previously
  // computed momentum, streak, and XP independently in JS and wrote them as
  // part of one big upsert below — a THIRD implementation alongside
  // lib/scorecard.ts's canonical functions and the Deno edge function's
  // (now-removed) hand-copy. Now calls ONE atomic Postgres function that
  // does the full row lock, all the math, and all the writes (momentum,
  // streak, XP, and task counters) in a single round trip — see
  // complete_task_atomic in supabase/migrations/20260719000000_atomic_scorecard_rpcs.sql.
  // This is genuinely faster than a naive per-metric RPC split would have
  // been, not just "no worse": one lock instead of three, one round trip
  // instead of four.
  const signal = dailyActivitySignal({
    tasksCompletedToday: todayCountBeforeThis + 1,
    isHardTask,
    reflectionFiled: false,
    wasOverridden: false,
  });

  type CompleteTaskAtomicResult = {
    momentum: number;
    streak: number;
    xp: number;
    xp_earned: number;
    consecutive: number;
  };

  const { data: taskResult, error: taskRpcError } = await admin
    .rpc("complete_task_atomic", {
      p_user_id: user.id,
      p_project_id: projectId || null,
      p_signal: signal,
      p_days_since_last_update: daysSinceLastUpdate,
      p_today: today,
      p_stage: stage || null,
    })
    .single<CompleteTaskAtomicResult>();

  if (taskRpcError) throw new Error(`complete_task_atomic failed: ${taskRpcError.message}`);

  const newMomentum = taskResult!.momentum;
  const newStreak = taskResult!.streak;
  const newXP = taskResult!.xp;
  const newConsecutive = taskResult!.consecutive;
  const xpEarned = taskResult!.xp_earned;


  // ── Pattern Detection (Playbook §3.2) ────────────────────────────────────
  // Run after every task completion — surfaces behavioural signals to the
  // next AI response rather than waiting for the evening cron.
  let activePattern: PatternResult | null = null;
  try {
    const pattern = detectPattern({
      avoidance_zones: (memory?.avoidance_zones ?? []) as string[],
      override_reasons: (ctx?.override_reasons ?? []) as string[],
      tasks_overridden_this_week: ctx?.tasks_overridden_this_week ?? 0,
      tasks_accepted_this_week: previousTaskCount + 1,
      momentum_score: newMomentum,
      momentum_last_week: ctx?.momentum_last_week ?? null,
      topics_mentioned_repeatedly: (ctx?.topics_mentioned_repeatedly ?? []) as string[],
      days_inactive: ctx?.days_inactive ?? 0,
      recent_task_titles: recentTaskTitles,
    });

    if (
      pattern.signal &&
      shouldSurfacePattern(ctx?.last_pattern_shown_at, pattern.severity)
    ) {
      activePattern = pattern;
    }
  } catch {
    // Pattern detection is non-fatal — never block task completion
  }

  // Only two things left to write here: tasks_accepted_this_week (a weekly
  // counter separate from the RPC's daily/total counters) and the
  // pattern-detection fields, which depend on newMomentum from the RPC
  // above so couldn't be folded into it. Everything else — momentum, streak,
  // xp, consecutive count, today/total counts, last_active, days_inactive,
  // current_stage — was already written atomically by complete_task_atomic.
  await admin.from("founder_context").upsert({
    user_id: user.id,
    tasks_accepted_this_week: previousTaskCount + 1,
    ...(activePattern?.signal
      ? {
          active_pattern_signal: activePattern.signal,
          active_pattern_message: activePattern.message,
          active_pattern_subject: activePattern.subject,
          last_pattern_shown_at: new Date().toISOString(),
        }
      : {}),
  }, { onConflict: "user_id" });

  // ── Mirror onto projects (read-only consumers: project_summaries view) ────
  // founder_context is the single source of truth — the RPCs above already
  // mirror momentum_score/streak onto projects internally (passed
  // p_project_id), so no separate mirror needed here anymore.

  const computedScore = newMomentum;
  // Non-blocking score history snapshot — feeds the Progress page 7-day trend
  if (typeof computedScore === "number") {
    Promise.resolve(
      admin
        .from("score_history")
        .upsert(
          { user_id: user.id, score: computedScore, recorded_at: new Date().toISOString() },
          { onConflict: "user_id,recorded_at::date" }
        )
    ).then(() => {}).catch(() => {});
  }

  if (taskTitle) {
    const zone = String(taskTitle).slice(0, 80);
    const field = outcome === "blocked" || outcome === "skipped" ? "avoidance_zones" : "strengths";
    void (async () => {
      const { data: mem } = await admin
        .from("founder_memory")
        .select(field)
        .eq("user_id", user.id)
        .maybeSingle();
      const memoryRow = mem as { avoidance_zones?: string[]; strengths?: string[] } | null;
      const current = ((memoryRow?.[field] as string[] | undefined) ?? []).filter(Boolean);
      if (current.length >= 10 || current.includes(zone)) return;
      if (memoryRow) {
        await admin
          .from("founder_memory")
          .update({ [field]: [...current, zone] })
          .eq("user_id", user.id);
      } else {
        await admin
          .from("founder_memory")
          .insert({ user_id: user.id, [field]: [zone] });
      }
    })().catch(() => {});
  }

  recordActivity(user.id, "task_completed", { stage, projectId }).catch(() => {});
  invalidateCognitionCache(user.id);
  if (projectId) checkAndCacheStageTransition(user.id, projectId).catch(() => {});

  // ── PATCH 1: Write completion to reflexion_learning_log (AWAITED) ─────────
  // Ensures Reports page task counts are always correct regardless of whether
  // the stream route's log_row_id path ran. Non-fatal — a failure here must
  // never block the task completion response.
  try {
    await admin.from("reflexion_learning_log").insert({
      user_id: user.id,
      project_id: projectId || null,
      stage: stage || ctx?.current_stage || null,
      action_shown: taskTitle || null,
      outcome: outcome === "blocked" || outcome === "skipped" ? outcome : "completed",
      outcome_recorded_at: new Date().toISOString(),
      session_id: `task_complete:${user.id}:${Date.now()}`,
    });
  } catch {
    // Non-fatal — table may not exist in all envs, or row already inserted by stream route
  }

  // Also write to action_logs — the source crons (sunday-email, meta-critic, weekly-report) read.
  try {
    await admin.from("action_logs").insert({
      user_id:   user.id,
      project_id: projectId || null,
      stage:     stage || ctx?.current_stage || null,
      action_shown: taskTitle || null,
      outcome:   outcome === "blocked" || outcome === "skipped" ? outcome : "completed",
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — backfilled from reflexion_learning_log if missing
  }
  // Founder Intelligence OBSERVE -> COMPARE -> LEARN.
  // Reflection submission already closes this loop; direct task completion
  // needs to do the same or deterministic prediction rows remain pending.
  compareFounderIntelligenceOutcome(admin, {
    userId: user.id,
    taskTitle: taskTitle || "",
    outcome,
    reflectionText: taskTitle || "",
  }).catch(() => {});
  // ── PATCH 2: Write checkin_done_date to user_behavior_state (AWAITED) ────
  // This was previously fire-and-forget. Awaiting it guarantees that by the time
  // the client receives this 200 response and navigates to /reflect, any other
  // device querying fetchBehaviorState will already see the done state in Supabase.
  // Cross-device check-in sync depends entirely on this write completing first.
  try {
    await admin.from("user_behavior_state")
      .upsert([{
        user_id: user.id,
        key: "checkin_done_date",
        value: today,
        updated_at: new Date().toISOString(),
      }], { onConflict: "user_id,key" });
  } catch {
    // Non-fatal — state will re-sync on next fetchBehaviorState call
  }

  return NextResponse.json({
    ok: true,
    momentum: newMomentum,
    isFirstTask,
    consecutiveTasksCompleted: newConsecutive,
    tasksCompletedTotal: (ctx?.tasks_completed_total ?? 0) + 1,
    xpEarned,
    xp: newXP,
    streak: newStreak,
    lastCheckinDate: today,
    // Surface detected pattern to the client so the today page can show it
    pattern: activePattern ? {
      signal: activePattern.signal,
      message: activePattern.message,
      severity: activePattern.severity,
    } : null,
  });
      }
